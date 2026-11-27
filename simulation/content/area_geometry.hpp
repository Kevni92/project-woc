#pragma once

#include "core/navigation.hpp"

#include <algorithm>
#include <cmath>
#include <numeric>
#include <vector>

namespace woc::content {

struct Box {
    double min_x, min_z, max_x, max_z;

    bool contains(double x, double z) const {
        return x >= min_x && z >= min_z && x <= max_x && z <= max_z;
    }

    bool meets(Box other) const {
        return min_x <= other.max_x && other.min_x <= max_x
            && min_z <= other.max_z && other.min_z <= max_z;
    }

    Box united(Box other) const {
        return {std::min(min_x, other.min_x), std::min(min_z, other.min_z),
                std::max(max_x, other.max_x), std::max(max_z, other.max_z)};
    }
};

struct Segment {
    Position a, b;

    Box bounds() const {
        return {static_cast<double>(std::min(a.x, b.x)), static_cast<double>(std::min(a.z, b.z)),
                static_cast<double>(std::max(a.x, b.x)), static_cast<double>(std::max(a.z, b.z))};
    }
};

// Packed bounding volume tree. Leaves contain small contiguous runs of entries.
class SpatialIndex {
public:
    explicit SpatialIndex(std::vector<Box> boxes) : boxes_(std::move(boxes)), ids_(boxes_.size()) {
        std::iota(ids_.begin(), ids_.end(), 0);
        if (!ids_.empty()) build(0, ids_.size());
    }

    template <typename Visit>
    void query(Box bounds, const Visit& visit) const {
        if (!nodes_.empty()) query_node(0, bounds, visit);
    }

private:
    struct Branch {
        Box bounds;
        std::size_t begin, end, right;
    };

    void build(std::size_t begin, std::size_t end) {
        const auto node = nodes_.size();
        auto bounds = boxes_[ids_[begin]];
        for (auto i = begin + 1; i < end; ++i) bounds = bounds.united(boxes_[ids_[i]]);
        nodes_.push_back({bounds, begin, end, 0});
        if (end - begin <= 8) return;
        const bool split_x = bounds.max_x - bounds.min_x >= bounds.max_z - bounds.min_z;
        const auto middle = begin + (end - begin) / 2;
        std::ranges::nth_element(ids_.begin() + begin, ids_.begin() + middle, ids_.begin() + end,
            {}, [&](auto id) {
                const auto box = boxes_[id];
                return split_x ? box.min_x + box.max_x : box.min_z + box.max_z;
            });
        build(begin, middle);
        nodes_[node].right = nodes_.size();
        build(middle, end);
    }

    template <typename Visit>
    void query_node(std::size_t node, Box bounds, const Visit& visit) const {
        const auto& branch = nodes_[node];
        if (!branch.bounds.meets(bounds)) return;
        if (branch.right) {
            query_node(node + 1, bounds, visit);
            query_node(branch.right, bounds, visit);
        } else {
            for (auto i = branch.begin; i < branch.end; ++i) {
                if (boxes_[ids_[i]].meets(bounds)) visit(ids_[i]);
            }
        }
    }

    std::vector<Box> boxes_;
    std::vector<std::size_t> ids_;
    std::vector<Branch> nodes_;
};

inline Position difference(Position a, Position b) { return {a.x - b.x, a.z - b.z}; }
inline Distance cross(Position a, Position b) { return a.x * b.z - a.z * b.x; }

inline void add_cuts(Segment line, Segment boundary, std::vector<double>& cuts) {
    const auto along = difference(line.b, line.a);
    const auto side = difference(boundary.b, boundary.a);
    const auto start = difference(boundary.a, line.a);
    const auto det = cross(along, side);
    if (det) {
        const auto t = static_cast<double>(cross(start, side)) / det;
        const auto u = static_cast<double>(cross(start, along)) / det;
        if (0 < t && t < 1 && 0 <= u && u <= 1) cuts.push_back(t);
    } else if (cross(start, along) == 0) {
        for (const auto end : {boundary.a, boundary.b}) {
            const auto offset = difference(end, line.a);
            const auto t = along.x ? static_cast<double>(offset.x) / along.x
                                   : static_cast<double>(offset.z) / along.z;
            if (0 < t && t < 1) cuts.push_back(t);
        }
    }
}

template <typename Test>
bool along_segment(Segment line, std::vector<double> cuts, const Test& test) {
    cuts.push_back(0);
    cuts.push_back(1);
    std::ranges::sort(cuts);
    const auto at = [&](double t) {
        return test(line.a.x + t * (line.b.x - line.a.x), line.a.z + t * (line.b.z - line.a.z));
    };
    if (!at(cuts.front())) return false;
    for (std::size_t i = 1; i < cuts.size(); ++i) {
        if (!at(cuts[i]) || !at((cuts[i - 1] + cuts[i]) / 2)) return false;
    }
    return true;
}

class AreaBoundary {
public:
    explicit AreaBoundary(std::vector<Segment> edges)
        : edges_(std::move(edges)), bounds_(edges_.front().bounds()), index_(edge_boxes()) {
        for (auto edge : edges_) bounds_ = bounds_.united(edge.bounds());
    }

    Box bounds() const { return bounds_; }
    const auto& edges() const { return edges_; }

    // Valid multipolygons can be classified using one even/odd test over all their rings.
    int side(double x, double z) const {
        constexpr double epsilon = 1e-6; // millimeters, for samples computed by interpolation
        if (x < bounds_.min_x - epsilon || x > bounds_.max_x + epsilon
            || z < bounds_.min_z - epsilon || z > bounds_.max_z + epsilon) return -1;
        bool interior = false;
        bool boundary = false;
        index_.query({x - epsilon, z - epsilon, bounds_.max_x + epsilon, z + epsilon}, [&](auto index) {
            const auto [a, b] = edges_[index];
            const auto span = edges_[index].bounds();
            const auto area = (b.x - a.x) * (z - a.z) - (b.z - a.z) * (x - a.x);
            if (x >= span.min_x - epsilon && x <= span.max_x + epsilon
                && z >= span.min_z - epsilon && z <= span.max_z + epsilon
                && std::abs(area) <= epsilon * std::hypot(b.x - a.x, b.z - a.z)) boundary = true;
            if ((a.z > z) != (b.z > z) && x < a.x + (b.x - a.x) * (z - a.z) / (b.z - a.z)) {
                interior = !interior;
            }
        });
        return boundary ? 0 : interior ? 1 : -1;
    }

    void cuts(Segment line, std::vector<double>& result) const {
        index_.query(line.bounds(), [&](auto i) { add_cuts(line, edges_[i], result); });
    }

    bool covers(Segment line) const {
        std::vector<double> split;
        cuts(line, split);
        return along_segment(line, std::move(split), [&](double x, double z) { return side(x, z) >= 0; });
    }

    bool covers(const AreaBoundary& other) const {
        if (!std::ranges::all_of(other.edges_, [&](auto edge) { return covers(edge); })) return false;
        // A covered outline can still surround an excluded hole.
        bool enclosed = false;
        index_.query(other.bounds(), [&](auto i) {
            if (enclosed) return;
            const auto edge = edges_[i];
            std::vector<double> split;
            other.cuts(edge, split);
            enclosed = !along_segment(edge, std::move(split), [&](double x, double z) { return other.side(x, z) <= 0; });
        });
        return !enclosed;
    }

    bool has_interior_on(const AreaBoundary& other) const {
        return std::ranges::any_of(edges_, [&](auto edge) {
            std::vector<double> split;
            other.cuts(edge, split);
            return !along_segment(edge, std::move(split), [&](double x, double z) { return other.side(x, z) <= 0; });
        });
    }

    template <typename Visit>
    void nearby(Segment line, const Visit& visit) const { index_.query(line.bounds(), visit); }

private:
    std::vector<Box> edge_boxes() const {
        std::vector<Box> boxes;
        boxes.reserve(edges_.size());
        for (auto edge : edges_) boxes.push_back(edge.bounds());
        return boxes;
    }

    std::vector<Segment> edges_;
    Box bounds_;
    SpatialIndex index_;
};

}

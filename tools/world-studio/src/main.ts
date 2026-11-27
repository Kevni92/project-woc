import { mount } from 'svelte';
import App from './App.svelte';
import 'maplibre-gl/dist/maplibre-gl.css';
import './style.css';
mount(App, { target: document.getElementById('app')! });

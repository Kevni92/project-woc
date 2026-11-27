import { mount } from 'svelte';
import { loadWorldPackage, worldPackageUrl } from './content/world-package';
import { transportFactory } from './simulation/config';
import { SimulationClient } from './simulation/simulation-client';
import App from './ui/App.svelte';
import './ui/styles.css';

const target = document.getElementById('app')!;
const query = new URLSearchParams(location.search);

async function start() {
  const panel = document.createElement('main');
  const status = document.createElement('p');
  status.setAttribute('role', 'status');
  status.textContent = 'Welt wird geladen …';
  panel.append(status);
  target.replaceChildren(panel);
  try {
    const world = await loadWorldPackage(worldPackageUrl(query, new URL(import.meta.env.BASE_URL, location.href)));
    const factory = transportFactory(query, world.init);
    target.replaceChildren();
    mount(App, {
      target,
      props: { world, clients: [new SimulationClient(factory, world.identity), new SimulationClient(factory, world.identity)] },
    });
  } catch (error) {
    status.setAttribute('role', 'alert');
    status.textContent = 'Welt konnte nicht geladen werden. ' + (error instanceof Error ? error.message : String(error));
    const retry = document.createElement('button');
    retry.textContent = 'Erneut laden';
    retry.onclick = () => void start();
    panel.append(retry);
    target.replaceChildren(panel);
  }
}

void start();

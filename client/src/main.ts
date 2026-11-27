import { mount } from 'svelte';
import { transportFactory } from './simulation/config';
import { SimulationClient } from './simulation/simulation-client';
import App from './ui/App.svelte';
import './ui/styles.css';

const factory = transportFactory(new URLSearchParams(location.search));

mount(App, {
  target: document.getElementById('app')!,
  props: { clients: [new SimulationClient(factory), new SimulationClient(factory)] },
});

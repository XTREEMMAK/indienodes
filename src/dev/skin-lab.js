import { mount } from 'svelte';
import '../app.css';
import SkinLab from './SkinLab.svelte';
import { skinStore } from '../skins/skinStore.svelte.js';

const target = document.getElementById('skin-lab-app');
if (!target) throw new Error('Skin laboratory mount point was not found.');
skinStore.init();
mount(SkinLab, { target });

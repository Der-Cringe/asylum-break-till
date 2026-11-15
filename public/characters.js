import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

// Character models live in assets/characters/<role>.glb, built by tools/character-pipeline from the
// source STL files. Each file holds six rigid parts in T-pose (Head, Torso, ArmR, ArmL, LegR, LegL),
// each with its origin on its joint, so the game can pose and animate them without a skeleton.
const ROLES = ['orderly', 'medic', 'director', 'patient'];
const templates = new Map();
const materials = new Map();

export function loadCharacterModels(onLoaded) {
  const loader = new GLTFLoader();
  for (const role of ROLES) {
    loader.load(`./assets/characters/${role}.glb?v=20261115-2`, gltf => {
      const material = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.82, metalness: 0.02 });
      materials.set(role, material);
      gltf.scene.traverse(child => {
        if (!child.isMesh) return;
        // Light strips keep their emissive glow material and the face keeps its texture (times the vertex
        // colours, which hold the baked occlusion); everything else is vertex painted.
        if (child.material.name === 'Face') child.material.roughness = material.roughness;
        else if (child.material.name !== 'Glow') child.material = material;
        child.castShadow = true;
        child.receiveShadow = true;
      });
      templates.set(role, gltf.scene);
      onLoaded(role);
    }, undefined, error => console.warn(`Character model for ${role} failed to load, keeping the blocky one`, error));
  }
}

export const hasCharacterModel = role => templates.has(role);

// Returns the posable parts for one character, or null while its model is still loading.
// Geometry and materials are shared with the template, so a clone is cheap.
export function buildCharacterModel(role) {
  const template = templates.get(role);
  if (!template) return null;
  const scene = template.clone(true);
  const model = scene.getObjectByName(role) || scene;
  const part = name => model.getObjectByName(name);
  const root = new THREE.Group();

  // Arms are modelled sticking out sideways. Each arm gets a shoulder pivot (swung around X for walking
  // and attacks); inside it the mesh is turned 90° so the arm hangs down in the rest pose.
  const limb = (name, hang) => {
    const mesh = part(name);
    const pivot = new THREE.Group();
    pivot.position.copy(mesh.position);
    mesh.position.set(0, 0, 0);
    mesh.rotation.set(0, 0, hang);
    pivot.add(mesh);
    root.add(pivot);
    return { pivot, mesh };
  };
  const armR = limb('ArmR', Math.PI / 2);   // -X arm: the character's right hand, which holds items
  const armL = limb('ArmL', -Math.PI / 2);
  const legR = limb('LegR', 0);
  const legL = limb('LegL', 0);
  const head = limb('Head', 0);
  const torso = limb('Torso', 0);

  const length = Number(armR.mesh.userData.length) || 1;
  const thickness = Number(armR.mesh.userData.thickness) || 0.5;
  const hand = new THREE.Group();
  hand.position.set(0, -(length - thickness * 0.9), thickness * 0.35);
  armR.pivot.add(hand);

  return {
    root,
    height: Number(model.userData.height) || 3,
    arm: armR.pivot, armL: armL.pivot, legR: legR.pivot, legL: legL.pivot, head: head.pivot, torso: torso.pivot, hand,
  };
}

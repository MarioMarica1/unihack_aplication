const response = await fetch('https://tiles.openfreemap.org/styles/liberty');
const data = await response.json();
console.log(JSON.stringify(data.layers.filter(layer => layer.id === 'building' || layer.id === 'building-3d'), null, 2));

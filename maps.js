// ============================================================
//  LUMO MAPS — maps.js
//  Leaflet + OpenStreetMap + Nominatim + OSRM
// ============================================================

let map, currentMarker, routeLayer, userMarker;
let currentPlace = null;
let allMarkers = [];
let debounceTimer = null;
let currentTileLayer = null;

const TILE_LAYERS = {
  default: {
    url: 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',
    attr: '© <a href="https://openstreetmap.org">OpenStreetMap</a> contributors'
  },
  satellite: {
    url: 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
    attr: '© Esri, DigitalGlobe, GeoEye, Earthstar Geographics'
  }
};

// Custom pin icon
function makeIcon(color = '#6b7280') {
  return L.divIcon({
    html: `<svg width="28" height="40" viewBox="0 0 28 40" xmlns="http://www.w3.org/2000/svg">
      <path d="M14 0C6.27 0 0 6.27 0 14c0 10.5 14 26 14 26S28 24.5 28 14C28 6.27 21.73 0 14 0z" fill="${color}" opacity="0.9"/>
      <circle cx="14" cy="14" r="6" fill="white" opacity="0.9"/>
    </svg>`,
    className: '',
    iconSize: [28, 40],
    iconAnchor: [14, 40],
    popupAnchor: [0, -42]
  });
}

function makeUserIcon() {
  return L.divIcon({
    html: `<div style="width:18px;height:18px;border-radius:50%;background:#3b82f6;border:3px solid white;box-shadow:0 0 0 3px rgba(59,130,246,0.3)"></div>`,
    className: '',
    iconSize: [18, 18],
    iconAnchor: [9, 9]
  });
}

// ---- Init map ----
document.addEventListener('DOMContentLoaded', () => {
  map = L.map('map', { zoomControl: false, attributionControl: true }).setView([20, 0], 3);

  // Default tile layer
  setMapStyle('default');

  // Click on map to drop pin
  map.on('click', (e) => {
    const { lat, lng } = e.latlng;
    reverseGeocode(lat, lng);
  });

  // Search input
  const input = document.getElementById('mapsSearchInput');
  const clearBtn = document.getElementById('mapsSearchClear');

  input?.addEventListener('input', () => {
    clearBtn?.classList.toggle('visible', input.value.length > 0);
    clearTimeout(debounceTimer);
    if (input.value.length < 2) { closeSuggestions(); return; }
    debounceTimer = setTimeout(() => fetchSuggestions(input.value), 350);
  });

  input?.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') { e.preventDefault(); searchPlaces(input.value); }
    if (e.key === 'Escape') { closeSuggestions(); input.blur(); }
  });

  clearBtn?.addEventListener('click', () => {
    input.value = '';
    clearBtn.classList.remove('visible');
    closeSuggestions();
    clearMarkers();
    closeSidebar();
    input.focus();
  });

  // Close suggestions on outside click
  document.addEventListener('click', (e) => {
    if (!e.target.closest('.maps-search-wrap')) closeSuggestions();
  });
});

// ---- Map styles ----
function setMapStyle(style) {
  if (currentTileLayer) map.removeLayer(currentTileLayer);
  const layer = TILE_LAYERS[style];
  currentTileLayer = L.tileLayer(layer.url, { attribution: layer.attr, maxZoom: 19 }).addTo(map);
  document.getElementById('styleDefault')?.classList.toggle('active', style === 'default');
  document.getElementById('styleSatellite')?.classList.toggle('active', style === 'satellite');
}

// ---- Loading indicator ----
function showLoading(text = 'Searching…') {
  const el = document.getElementById('mapsLoading');
  document.getElementById('mapsLoadingText').textContent = text;
  el?.classList.add('visible');
}
function hideLoading() { document.getElementById('mapsLoading')?.classList.remove('visible'); }

// ---- Autocomplete suggestions ----
async function fetchSuggestions(query) {
  try {
    const res = await fetch(`https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(query)}&limit=5&addressdetails=1`, {
      headers: { 'Accept-Language': 'en' }
    });
    const data = await res.json();
    renderSuggestions(data);
  } catch { closeSuggestions(); }
}

function renderSuggestions(results) {
  const box = document.getElementById('mapsSuggestions');
  if (!results.length) { closeSuggestions(); return; }
  box.innerHTML = results.map(r => {
    const icon = getPlaceIcon(r.type, r.class);
    const name = r.name || r.display_name.split(',')[0];
    const addr = r.display_name;
    return `<div class="maps-suggestion-item" onclick="selectSuggestion(${r.lat}, ${r.lon}, '${esc(name)}', '${esc(addr)}')">
      <span class="maps-suggestion-icon">${icon}</span>
      <div>
        <div class="maps-suggestion-name">${name}</div>
        <div class="maps-suggestion-addr">${addr}</div>
      </div>
    </div>`;
  }).join('');
  box.classList.add('open');
}

function closeSuggestions() { document.getElementById('mapsSuggestions')?.classList.remove('open'); }

function selectSuggestion(lat, lon, name, addr) {
  closeSuggestions();
  document.getElementById('mapsSearchInput').value = name;
  document.getElementById('mapsSearchClear')?.classList.add('visible');
  placePin(parseFloat(lat), parseFloat(lon), name, addr, true);
}

// ---- Full search ----
async function searchPlaces(query) {
  if (!query.trim()) return;
  closeSuggestions();
  showLoading('Searching…');
  clearMarkers();

  try {
    const res = await fetch(`https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(query)}&limit=8&addressdetails=1`, {
      headers: { 'Accept-Language': 'en' }
    });
    const data = await res.json();
    hideLoading();

    if (!data.length) {
      showSidebarSearchResults(query, []);
      return;
    }

    // Place all result markers
    const bounds = [];
    data.forEach((r, i) => {
      const lat = parseFloat(r.lat), lon = parseFloat(r.lon);
      const name = r.name || r.display_name.split(',')[0];
      const marker = L.marker([lat, lon], { icon: makeIcon(i === 0 ? '#6b7280' : '#9ca3af') }).addTo(map);
      marker.on('click', () => placePin(lat, lon, name, r.display_name, false));
      allMarkers.push(marker);
      bounds.push([lat, lon]);
    });

    if (bounds.length === 1) {
      map.setView(bounds[0], 15, { animate: true });
    } else {
      map.fitBounds(bounds, { padding: [60, 60], animate: true });
    }

    showSidebarSearchResults(query, data);

  } catch {
    hideLoading();
  }
}

function showSidebarSearchResults(query, results) {
  document.getElementById('placeView').style.display = 'none';
  document.getElementById('searchResultsView').style.display = 'flex';
  document.getElementById('directionsPanel').classList.remove('open');
  document.getElementById('searchResultsTitle').textContent = `"${query}"`;
  document.getElementById('searchResultsCount').textContent = results.length
    ? `${results.length} result${results.length > 1 ? 's' : ''} found`
    : 'No results found';

  const list = document.getElementById('sidebarResultsList');
  if (!results.length) {
    list.innerHTML = `<div style="padding:2rem;text-align:center;color:var(--text-muted);font-size:0.875rem">No results for this search.<br>Try a different term.</div>`;
  } else {
    list.innerHTML = results.map((r, i) => {
      const name = r.name || r.display_name.split(',')[0];
      const icon = getPlaceIcon(r.type, r.class);
      return `<div class="sidebar-result-item ${i === 0 ? 'active' : ''}" onclick="selectResult(${r.lat}, ${r.lon}, '${esc(name)}', '${esc(r.display_name)}', this)">
        <div class="sidebar-result-icon">${icon}</div>
        <div>
          <div class="sidebar-result-name">${name}</div>
          <div class="sidebar-result-addr">${r.display_name}</div>
        </div>
      </div>`;
    }).join('');
  }

  openSidebar();
}

function selectResult(lat, lon, name, addr, el) {
  document.querySelectorAll('.sidebar-result-item').forEach(e => e.classList.remove('active'));
  el.classList.add('active');
  map.setView([parseFloat(lat), parseFloat(lon)], 16, { animate: true });
  // Update first marker to highlight
  if (currentMarker) map.removeLayer(currentMarker);
  currentMarker = L.marker([parseFloat(lat), parseFloat(lon)], { icon: makeIcon('#4b5563') })
    .addTo(map)
    .bindPopup(`<div class="popup-name">${name}</div><div class="popup-addr">${addr}</div>`)
    .openPopup();
  currentPlace = { lat: parseFloat(lat), lon: parseFloat(lon), name, addr };
}

// ---- Place a pin ----
function placePin(lat, lon, name, addr, zoom = true) {
  clearMarkers();
  currentMarker = L.marker([lat, lon], { icon: makeIcon('#4b5563') })
    .addTo(map)
    .bindPopup(`<div class="popup-name">${name}</div><div class="popup-addr">${addr}</div>`)
    .openPopup();
  allMarkers.push(currentMarker);
  if (zoom) map.setView([lat, lon], 15, { animate: true });
  currentPlace = { lat, lon, name, addr };
  showPlaceDetail(name, addr, lat, lon);
}

function showPlaceDetail(name, addr, lat, lon) {
  document.getElementById('placeView').style.display = 'flex';
  document.getElementById('searchResultsView').style.display = 'none';
  document.getElementById('directionsPanel').classList.remove('open');
  document.getElementById('placeName').textContent = name;
  document.getElementById('placeAddr').textContent = addr;
  document.getElementById('placeCoords').innerHTML = `Coordinates: <span>${lat.toFixed(5)}, ${lon.toFixed(5)}</span>`;
  openSidebar();
}

// ---- Reverse geocode (click on map) ----
async function reverseGeocode(lat, lon) {
  showLoading('Getting location info…');
  try {
    const res = await fetch(`https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lon}`, {
      headers: { 'Accept-Language': 'en' }
    });
    const data = await res.json();
    hideLoading();
    const name = data.name || data.display_name?.split(',')[0] || 'Selected location';
    placePin(lat, lon, name, data.display_name || `${lat.toFixed(5)}, ${lon.toFixed(5)}`, false);
    document.getElementById('mapsSearchInput').value = name;
    document.getElementById('mapsSearchClear')?.classList.add('visible');
  } catch {
    hideLoading();
    placePin(lat, lon, 'Selected location', `${lat.toFixed(5)}, ${lon.toFixed(5)}`, false);
  }
}

// ---- Locate me ----
function locateMe() {
  if (!navigator.geolocation) return;
  const btn = document.getElementById('locateBtn');
  btn.style.color = 'var(--brand-1)';
  showLoading('Finding your location…');
  navigator.geolocation.getCurrentPosition((pos) => {
    const { latitude: lat, longitude: lon } = pos.coords;
    hideLoading();
    btn.style.color = '';
    if (userMarker) map.removeLayer(userMarker);
    userMarker = L.marker([lat, lon], { icon: makeUserIcon() }).addTo(map).bindPopup('📍 You are here').openPopup();
    map.setView([lat, lon], 15, { animate: true });
    reverseGeocode(lat, lon);
  }, () => {
    hideLoading();
    btn.style.color = '';
    alert('Location access denied or unavailable.');
  });
}

// ---- Directions ----
function startDirectionsTo() {
  document.getElementById('placeView').style.display = 'none';
  document.getElementById('searchResultsView').style.display = 'none';
  const panel = document.getElementById('directionsPanel');
  panel.classList.add('open');
  if (currentPlace) {
    document.getElementById('directionsDest').value = currentPlace.name;
  }
  document.getElementById('directionsOrigin').focus();
  openSidebar();
}

function closeDirections() {
  document.getElementById('directionsPanel').classList.remove('open');
  if (routeLayer) { map.removeLayer(routeLayer); routeLayer = null; }
  closeSidebar();
}

async function getDirections() {
  const originInput = document.getElementById('directionsOrigin').value.trim();
  const destInput = document.getElementById('directionsDest').value.trim();
  if (!originInput || !destInput) return;

  showLoading('Getting directions…');
  document.getElementById('directionsResult').style.display = 'none';
  document.getElementById('directionsSteps').innerHTML = '';

  try {
    // Geocode origin if not coords
    let originCoords, destCoords;

    if (originInput.toLowerCase() === 'my location' || originInput.toLowerCase() === 'current location') {
      originCoords = await getMyCoords();
    } else {
      originCoords = await geocodePlace(originInput);
    }
    destCoords = currentPlace && document.getElementById('directionsDest').value === currentPlace.name
      ? [currentPlace.lon, currentPlace.lat]
      : await geocodePlace(destInput);

    if (!originCoords || !destCoords) { hideLoading(); alert('Could not find one of the locations.'); return; }

    // OSRM routing
    const res = await fetch(`https://router.project-osrm.org/route/v1/driving/${originCoords[0]},${originCoords[1]};${destCoords[0]},${destCoords[1]}?overview=full&geometries=geojson&steps=true`);
    const data = await res.json();
    hideLoading();

    if (!data.routes?.length) { alert('No route found.'); return; }

    const route = data.routes[0];
    const distance = (route.distance / 1000).toFixed(1) + ' km';
    const duration = Math.round(route.duration / 60) + ' min';

    // Draw route on map
    if (routeLayer) map.removeLayer(routeLayer);
    routeLayer = L.geoJSON(route.geometry, {
      style: { color: '#6b7280', weight: 5, opacity: 0.8 }
    }).addTo(map);
    map.fitBounds(routeLayer.getBounds(), { padding: [60, 60], animate: true });

    // Show summary
    document.getElementById('directionsResult').style.display = 'block';
    document.getElementById('directionsSummary').innerHTML = `
      <div class="directions-summary-item"><div class="directions-summary-val">${duration}</div><div class="directions-summary-label">Duration</div></div>
      <div class="directions-summary-item"><div class="directions-summary-val">${distance}</div><div class="directions-summary-label">Distance</div></div>
    `;

    // Show steps
    const steps = route.legs[0]?.steps || [];
    document.getElementById('directionsSteps').innerHTML = steps.map((s, i) => `
      <div class="directions-step">
        <div class="step-num">${i + 1}</div>
        <div>${cleanInstruction(s.maneuver?.instruction || s.name || 'Continue')}</div>
      </div>
    `).join('');

  } catch (err) {
    hideLoading();
    console.error('Directions error:', err);
    alert('Could not get directions. Please try again.');
  }
}

async function geocodePlace(query) {
  const res = await fetch(`https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(query)}&limit=1`, {
    headers: { 'Accept-Language': 'en' }
  });
  const data = await res.json();
  if (!data.length) return null;
  return [parseFloat(data[0].lon), parseFloat(data[0].lat)];
}

function getMyCoords() {
  return new Promise((resolve) => {
    navigator.geolocation.getCurrentPosition(
      (pos) => resolve([pos.coords.longitude, pos.coords.latitude]),
      () => resolve(null)
    );
  });
}

function cleanInstruction(text) {
  return text.replace(/\b\w/g, c => c.toUpperCase());
}

// ---- Sidebar helpers ----
function openSidebar() { document.getElementById('mapsSidebar')?.classList.add('open'); }
function closeSidebar() {
  document.getElementById('mapsSidebar')?.classList.remove('open');
  document.getElementById('placeView').style.display = 'none';
  document.getElementById('searchResultsView').style.display = 'none';
}

// ---- Copy coords ----
function copyCoords() {
  if (!currentPlace) return;
  navigator.clipboard?.writeText(`${currentPlace.lat.toFixed(5)}, ${currentPlace.lon.toFixed(5)}`);
  const btn = document.querySelector('.sidebar-action-btn:nth-child(2)');
  if (btn) { const orig = btn.innerHTML; btn.innerHTML = `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>Copied!`; setTimeout(() => btn.innerHTML = orig, 1500); }
}

// ---- Share location ----
function shareLocation() {
  if (!currentPlace) return;
  const url = `https://www.openstreetmap.org/?mlat=${currentPlace.lat}&mlon=${currentPlace.lon}#map=15/${currentPlace.lat}/${currentPlace.lon}`;
  navigator.clipboard?.writeText(url);
  alert('OpenStreetMap link copied to clipboard!');
}

// ---- Clear markers ----
function clearMarkers() {
  allMarkers.forEach(m => map.removeLayer(m));
  allMarkers = [];
  if (currentMarker) { map.removeLayer(currentMarker); currentMarker = null; }
}

// ---- Place type icons ----
function getPlaceIcon(type, cls) {
  const map_ = {
    restaurant: '🍽️', cafe: '☕', bar: '🍺', fast_food: '🍔', pub: '🍻',
    hotel: '🏨', hospital: '🏥', pharmacy: '💊', school: '🏫', university: '🎓',
    bank: '🏦', atm: '💳', supermarket: '🛒', shop: '🛍️', mall: '🏬',
    park: '🌳', museum: '🏛️', cinema: '🎬', theatre: '🎭', library: '📚',
    church: '⛪', mosque: '🕌', fuel: '⛽', parking: '🅿️', bus_station: '🚌',
    train_station: '🚉', airport: '✈️', police: '👮', fire_station: '🚒',
    beach: '🏖️', mountain: '⛰️', forest: '🌲', lake: '💧',
    city: '🏙️', town: '🏘️', village: '🏡', suburb: '🏠',
  };
  return map_[type] || (cls === 'highway' ? '🛣️' : cls === 'waterway' ? '💧' : cls === 'natural' ? '🌿' : '📍');
}

function esc(str) {
  return (str || '').replace(/'/g, "\\'").replace(/"/g, '&quot;');
}

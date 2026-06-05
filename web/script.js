const DEFAULT_CENTER = [13.0827, 80.2707];
const GROUP_COLORS = ["#d94841", "#2f9e44", "#3b5bdb", "#f08c00", "#0b7285", "#9c36b5"];

const map = L.map("map").setView(DEFAULT_CENTER, 13);

const baseLayers = {
    street: L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
        attribution: "&copy; OpenStreetMap contributors"
    }),
    satellite: L.tileLayer("https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}", {
        attribution: "Tiles &copy; Esri"
    }),
    grayscale: L.tileLayer("https://tiles.stadiamaps.com/tiles/alidade_smooth/{z}/{x}/{y}{r}.png", {
        attribution: "&copy; Stadia Maps, &copy; OpenMapTiles, &copy; OpenStreetMap contributors"
    }),
    dark: L.tileLayer("https://tiles.stadiamaps.com/tiles/alidade_smooth_dark/{z}/{x}/{y}{r}.png", {
        attribution: "&copy; Stadia Maps, &copy; OpenMapTiles, &copy; OpenStreetMap contributors"
    })
};

baseLayers.street.addTo(map);

let activeBaseLayer = baseLayers.street;
let thresholdMeters = 100;
let addModeEnabled = true;
let markerVisible = true;
let showDistanceEnabled = false;
let showRadiusRings = false;
let markerCount = 0;
let selectedMarkerId = null;
let lastGroups = [];
let lastGroupSeeds = [];
let toastTimer = null;

const markers = [];

const markerLayer = L.layerGroup().addTo(map);
const groupPolygonLayer = L.layerGroup().addTo(map);
const groupLabelLayer = L.layerGroup().addTo(map);
const groupRingLayer = L.layerGroup().addTo(map);
const selectedRingLayer = L.layerGroup().addTo(map);
const hoverLayer = L.layerGroup().addTo(map);

const markerDetailsEl = document.getElementById("marker-details");
const groupListEl = document.getElementById("group-list");
const groupEmptyEl = document.getElementById("group-empty");
const basemapSelectEl = document.getElementById("basemap-select");
const thresholdInputEl = document.getElementById("threshold-input");
const groupButtonEl = document.getElementById("group-markers-btn");
const showMarkerDetailsBtnEl = document.getElementById("show-marker-details-btn");
const toastEl = document.getElementById("toast");
const mapButtonsEl = document.getElementById("map-buttons");

function showToast(message) {
    toastEl.textContent = message;
    toastEl.classList.add("show");
    if (toastTimer) {
        clearTimeout(toastTimer);
    }
    toastTimer = setTimeout(function () {
        toastEl.classList.remove("show");
    }, 1500);
}

function createMapButton(icon, label, action, handler) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "map-button";
    button.title = label;
    button.setAttribute("aria-label", label);
    button.dataset.action = action;
    button.textContent = icon;
    button.addEventListener("click", handler);
    return button;
}

function setMapButtonStates() {
    const buttons = mapButtonsEl.querySelectorAll("button");
    buttons.forEach(function (button) {
        if (button.dataset.action === "toggle-marker") {
            button.classList.toggle("is-active", addModeEnabled);
        }
        if (button.dataset.action === "visibility") {
            button.classList.toggle("is-active", markerVisible);
        }
        if (button.dataset.action === "distance") {
            button.classList.toggle("is-active", showDistanceEnabled);
        }
        if (button.dataset.action === "rings") {
            button.classList.toggle("is-active", showRadiusRings);
        }
    });
}

function updateMapButtons() {
    mapButtonsEl.innerHTML = "";
    mapButtonsEl.appendChild(createMapButton("✎", "Toggle marker", "toggle-marker", toggleAddMode));
    mapButtonsEl.appendChild(createMapButton("↶", "Undo last marker", "undo", undoLastMarker));
    mapButtonsEl.appendChild(createMapButton("⌫", "Clear all markers", "clear", clearAllMarkers));
    mapButtonsEl.appendChild(createMapButton("◫", "Toggle hide/show markers", "visibility", toggleMarkerVisibility));
    mapButtonsEl.appendChild(createMapButton("⋯", "Toggle distance", "distance", toggleDistanceLines));
    mapButtonsEl.appendChild(createMapButton("i", "Workflow info", "info", showWorkflowInfo));
    mapButtonsEl.appendChild(createMapButton("◌", "Toggle radius rings", "rings", toggleRadiusRings));
    setMapButtonStates();
}

function switchBasemap(key) {
    const nextLayer = baseLayers[key];
    if (!nextLayer || nextLayer === activeBaseLayer) {
        return;
    }
    map.removeLayer(activeBaseLayer);
    activeBaseLayer = nextLayer;
    activeBaseLayer.addTo(map);
}

function clearVisualLayers() {
    groupPolygonLayer.clearLayers();
    groupLabelLayer.clearLayers();
    groupRingLayer.clearLayers();
    selectedRingLayer.clearLayers();
    hoverLayer.clearLayers();
}

function createMarkerIcon(markerObj) {
    const classes = ["marker-dot"];
    classes.push(markerObj.groupIndex === null ? "ungrouped" : "grouped");
    if (markerObj.id === selectedMarkerId) {
        classes.push("selected");
    }
    if (!markerVisible) {
        classes.push("hidden-marker");
    }

    return L.divIcon({
        className: "marker-dot-icon",
        html: '<div class="' + classes.join(" ") + '">' + markerObj.id + "</div>",
        iconSize: [28, 28],
        iconAnchor: [14, 14]
    });
}

function getMarkerGroupText(markerObj) {
    return markerObj.groupIndex === null ? "not grouped yet" : "g" + (markerObj.groupIndex + 1);
}

function markerTooltipHtml(markerObj) {
    const latLng = markerObj.marker.getLatLng();
    return "Marker " + markerObj.id + "<br>Lat: " + latLng.lat.toFixed(5) + "<br>Lng: " + latLng.lng.toFixed(5) + "<br>Group: " + getMarkerGroupText(markerObj);
}

function refreshMarkerTooltip(markerObj) {
    markerObj.marker.unbindTooltip();
    markerObj.marker.bindTooltip(markerTooltipHtml(markerObj), {
        direction: "top",
        offset: [0, -18],
        className: "marker-hover-tooltip"
    });
}

function refreshAllMarkers() {
    for (let i = 0; i < markers.length; i++) {
        markers[i].marker.setIcon(createMarkerIcon(markers[i]));
        refreshMarkerTooltip(markers[i]);
    }
}

function setMarkerLayerVisibility() {
    if (markerVisible) {
        if (!map.hasLayer(markerLayer)) {
            map.addLayer(markerLayer);
        }
    } else if (map.hasLayer(markerLayer)) {
        map.removeLayer(markerLayer);
    }
    refreshAllMarkers();
    setMapButtonStates();
}

function renderMarkerDetails() {
    if (markers.length === 0) {
        markerDetailsEl.textContent = "No markers have been added yet.";
        return;
    }

    const lines = [];
    for (let i = 0; i < markers.length; i++) {
        const markerObj = markers[i];
        const latLng = markerObj.marker.getLatLng();
        lines.push(markerObj.id + " | Lat: " + latLng.lat.toFixed(5) + ", Lng: " + latLng.lng.toFixed(5) + " | Group: " + getMarkerGroupText(markerObj));
    }

    markerDetailsEl.textContent = lines.join("\n");
}

function renderGroupResults(groups) {
    groupListEl.innerHTML = "";

    if (markers.length === 0) {
        groupEmptyEl.textContent = "Add markers and group them to see the group details here.";
        return;
    }

    if (groups.length === 0) {
        groupEmptyEl.textContent = "Markers are present. Use Group Markers to generate group details.";
        return;
    }

    groupEmptyEl.textContent = "";

    for (let g = 0; g < groups.length; g++) {
        const group = groups[g];
        const color = GROUP_COLORS[g % GROUP_COLORS.length];
        const markerNames = group.map(function (index) {
            return markers[index].id;
        });

        const item = document.createElement("li");
        item.className = "group-item";

        const chip = document.createElement("span");
        chip.className = "group-chip";
        chip.style.background = color;
        chip.textContent = "g" + (g + 1);

        const text = document.createElement("div");
        text.className = "group-text";
        text.textContent = "group " + (g + 1) + " : " + markerNames.join(", ");

        item.appendChild(chip);
        item.appendChild(text);
        groupListEl.appendChild(item);
    }
}

function updateMarkerGroupAssignments(groups) {
    for (let i = 0; i < markers.length; i++) {
        markers[i].groupIndex = null;
    }

    for (let g = 0; g < groups.length; g++) {
        for (let i = 0; i < groups[g].length; i++) {
            markers[groups[g][i]].groupIndex = g;
        }
    }
}

function averagePoint(points) {
    let latSum = 0;
    let lngSum = 0;

    for (let i = 0; i < points.length; i++) {
        latSum += points[i].lat;
        lngSum += points[i].lng;
    }

    return L.latLng(latSum / points.length, lngSum / points.length);
}

function getMarkersWithinRadius(seedIndex, candidateIndices) {
    const seedLatLng = markers[seedIndex].marker.getLatLng();
    const nearby = [];

    for (let i = 0; i < candidateIndices.length; i++) {
        const candidateIndex = candidateIndices[i];
        const distance = map.distance(seedLatLng, markers[candidateIndex].marker.getLatLng());
        if (distance <= thresholdMeters) {
            nearby.push(candidateIndex);
        }
    }

    return nearby;
}

function buildGroups() {
    const remaining = markers.map(function (_, index) {
        return index;
    });
    const groups = [];
    const seeds = [];

    while (remaining.length > 0) {
        let bestSeedIndex = remaining[0];
        let bestGroup = [];

        for (let i = 0; i < remaining.length; i++) {
            const seedIndex = remaining[i];
            const candidateGroup = getMarkersWithinRadius(seedIndex, remaining);
            if (candidateGroup.length > bestGroup.length || (candidateGroup.length === bestGroup.length && seedIndex < bestSeedIndex)) {
                bestSeedIndex = seedIndex;
                bestGroup = candidateGroup;
            }
        }

        if (bestGroup.length === 0) {
            bestGroup = [bestSeedIndex];
        }

        groups.push(bestGroup);
        seeds.push(bestSeedIndex);

        const nextRemaining = [];
        for (let i = 0; i < remaining.length; i++) {
            if (bestGroup.indexOf(remaining[i]) === -1) {
                nextRemaining.push(remaining[i]);
            }
        }

        remaining.length = 0;
        Array.prototype.push.apply(remaining, nextRemaining);
    }

    return {
        groups: groups,
        seeds: seeds
    };
}

function renderSelectedRing() {
    selectedRingLayer.clearLayers();

    if (!selectedMarkerId || !showRadiusRings) {
        return;
    }

    let selectedMarker = null;
    for (let i = 0; i < markers.length; i++) {
        if (markers[i].id === selectedMarkerId) {
            selectedMarker = markers[i];
            break;
        }
    }

    if (!selectedMarker) {
        return;
    }

    L.circle(selectedMarker.marker.getLatLng(), {
        radius: thresholdMeters,
        color: "#ffd666",
        weight: 2,
        fillColor: "#ffd666",
        fillOpacity: 0.05,
        dashArray: "4 6"
    }).addTo(selectedRingLayer);
}

function renderGroups(groups, seeds) {
    clearVisualLayers();

    if (showRadiusRings) {
        for (let i = 0; i < groups.length; i++) {
            const seed = markers[seeds[i]];
            L.circle(seed.marker.getLatLng(), {
                radius: thresholdMeters,
                color: GROUP_COLORS[i % GROUP_COLORS.length],
                weight: 2,
                fillColor: GROUP_COLORS[i % GROUP_COLORS.length],
                fillOpacity: 0.05,
                dashArray: "4 6"
            }).addTo(groupRingLayer);
        }
    }

    for (let g = 0; g < groups.length; g++) {
        const group = groups[g];
        const color = GROUP_COLORS[g % GROUP_COLORS.length];
        const points = group.map(function (index) {
            return markers[index].marker.getLatLng();
        });
        const ids = group.map(function (index) {
            return markers[index].id;
        });

        if (group.length >= 3) {
            const polygon = L.polygon(points, {
                color: color,
                weight: 3,
                fillColor: color,
                fillOpacity: 0.12,
                className: "group-shape"
            }).addTo(groupPolygonLayer);

            polygon.bindTooltip("g" + (g + 1) + "<br>" + ids.join(", "), {
                className: "group-hover-tooltip"
            });
        } else if (group.length === 2) {
            const line = L.polyline(points, {
                color: color,
                weight: 3,
                dashArray: showDistanceEnabled ? null : "6 10",
                className: "group-shape"
            }).addTo(groupPolygonLayer);

            line.bindTooltip("g" + (g + 1) + "<br>" + ids.join(", "), {
                className: "group-hover-tooltip"
            });
        } else {
            L.circleMarker(points[0], {
                color: color,
                radius: 10,
                fillColor: color,
                fillOpacity: 0.18,
                weight: 3,
                className: "group-shape"
            }).addTo(groupPolygonLayer);
        }

        L.marker(averagePoint(points), {
            icon: L.divIcon({
                className: "group-label-marker",
                html: '<div class="group-label" style="--group-color:' + color + '">g' + (g + 1) + '</div>',
                iconSize: [1, 1],
                iconAnchor: [0, 0]
            })
        }).addTo(groupLabelLayer);
    }

    lastGroups = groups;
    lastGroupSeeds = seeds;
    updateMarkerGroupAssignments(groups);
    refreshAllMarkers();
    renderGroupResults(groups);
    renderMarkerDetails();
    renderSelectedRing();
}

function groupMarkers() {
    if (markers.length === 0) {
        showToast("Add markers first");
        return;
    }

    const result = buildGroups();
    renderGroups(result.groups, result.seeds);
    showToast("Grouping complete");
}

function addMarker(latLng) {
    markerCount += 1;
    const markerId = "m" + markerCount;

    const marker = L.marker(latLng, {
        icon: L.divIcon({
            className: "marker-dot-icon",
            html: '<div class="marker-dot ungrouped">' + markerId + "</div>",
            iconSize: [28, 28],
            iconAnchor: [14, 14]
        })
    });

    const markerObj = {
        id: markerId,
        marker: marker,
        groupIndex: null
    };

    marker.on("click", function () {
        if (addModeEnabled) {
            removeMarkerById(markerId);
        } else {
            selectMarker(markerId);
        }
    });

    markers.push(markerObj);
    markerLayer.addLayer(marker);
    selectedMarkerId = markerId;
    refreshMarkerTooltip(markerObj);
    refreshAllMarkers();
    renderMarkerDetails();
    renderGroupResults(lastGroups);
    showToast("Marker " + markerId + " added");
}

function removeMarkerById(markerId) {
    const index = markers.findIndex(function (markerObj) {
        return markerObj.id === markerId;
    });

    if (index === -1) {
        return;
    }

    const removed = markers[index];
    markerLayer.removeLayer(removed.marker);
    markers.splice(index, 1);
    markerCount = markers.length;
    selectedMarkerId = markers.length > 0 ? markers[markers.length - 1].id : null;
    lastGroups = [];
    lastGroupSeeds = [];
    clearVisualLayers();
    refreshAllMarkers();
    renderGroupResults([]);
    renderMarkerDetails();
    showToast("Removed " + removed.id);
}

function undoLastMarker() {
    if (markers.length === 0) {
        showToast("No marker to undo");
        return;
    }

    removeMarkerById(markers[markers.length - 1].id);
}

function clearAllMarkers() {
    if (markers.length === 0) {
        showToast("No markers to clear");
        return;
    }

    if (!window.confirm("Clear all markers and group visuals?")) {
        return;
    }

    markers.length = 0;
    markerCount = 0;
    selectedMarkerId = null;
    lastGroups = [];
    lastGroupSeeds = [];

    markerLayer.clearLayers();
    clearVisualLayers();
    renderGroupResults([]);
    renderMarkerDetails();
    setMapButtonStates();
    showToast("All markers cleared");
}

function selectMarker(markerId) {
    selectedMarkerId = markerId;
    refreshAllMarkers();
    renderMarkerDetails();
    renderSelectedRing();
}

function toggleAddMode() {
    addModeEnabled = !addModeEnabled;
    setMapButtonStates();
    showToast(addModeEnabled ? "Marker mode on" : "Marker mode off");
}

function toggleMarkerVisibility() {
    markerVisible = !markerVisible;
    setMarkerLayerVisibility();
    showToast(markerVisible ? "Markers shown" : "Markers hidden");
}

function toggleDistanceLines() {
    showDistanceEnabled = !showDistanceEnabled;
    if (lastGroups.length > 0) {
        renderGroups(lastGroups, lastGroupSeeds);
    }
    setMapButtonStates();
    showToast(showDistanceEnabled ? "Distance lines shown" : "Distance lines hidden");
}

function toggleRadiusRings() {
    showRadiusRings = !showRadiusRings;
    if (lastGroups.length > 0) {
        renderGroups(lastGroups, lastGroupSeeds);
    } else {
        renderSelectedRing();
    }
    setMapButtonStates();
    showToast(showRadiusRings ? "Radius rings shown" : "Radius rings hidden");
}

function showWorkflowInfo() {
    showToast("Step 1 add markers, step 2 group markers, step 3 inspect group details");
}

function initCoordinateDisplay() {
    const control = L.control({ position: "bottomleft" });
    control.onAdd = function () {
        const container = L.DomUtil.create("div", "coord-display");
        container.textContent = "Lat: -, Lon: -";
        return container;
    };
    control.addTo(map);

    const display = control.getContainer();
    map.on("mousemove", function (event) {
        display.textContent = "Lat: " + event.latlng.lat.toFixed(5) + ", Lon: " + event.latlng.lng.toFixed(5);
    });
}

basemapSelectEl.addEventListener("change", function (event) {
    switchBasemap(event.target.value);
});

thresholdInputEl.addEventListener("change", function () {
    const value = Number(thresholdInputEl.value);
    if (!Number.isNaN(value) && value > 0) {
        thresholdMeters = value;
        lastGroups = [];
        lastGroupSeeds = [];
        clearVisualLayers();
        renderGroupResults([]);
        renderMarkerDetails();
        renderSelectedRing();
        showToast("Threshold set to " + thresholdMeters + " m");
    }
});

showMarkerDetailsBtnEl.addEventListener("click", function () {
    renderMarkerDetails();
    showToast("Marker details displayed");
});

groupButtonEl.addEventListener("click", function () {
    groupMarkers();
});

map.on("click", function (event) {
    if (!addModeEnabled) {
        return;
    }
    addMarker(event.latlng);
});

function init() {
    initCoordinateDisplay();
    updateMapButtons();
    setMarkerLayerVisibility();
    renderGroupResults([]);
    renderMarkerDetails();
    setMapButtonStates();
}

init();

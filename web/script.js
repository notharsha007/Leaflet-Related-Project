const map = L.map("map").setView([13.0827, 80.2707], 13);

L.tileLayer(
    "https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png",
    {
        attribution: "&copy; OpenStreetMap contributors"
    }
).addTo(map);

const DISTANCE_THRESHOLD_METERS = 100;

const markers = [];
let markerCount = 0;

const groupPolygonsLayer = L.layerGroup().addTo(map);
const groupLabelsLayer = L.layerGroup().addTo(map);

const groupSummaryEl = document.getElementById("group-summary");

function clearVisualLayers() {
    groupPolygonsLayer.clearLayers();
    groupLabelsLayer.clearLayers();
}

function getMarkerLatLng(markerObj) {
    return markerObj.marker.getLatLng();
}

function buildAdjacencyAndConnectedPairs() {
    const n = markers.length;
    const adjacency = Array.from({ length: n }, function () {
        return [];
    });

    for (let i = 0; i < n - 1; i++) {
        const p1 = getMarkerLatLng(markers[i]);

        for (let j = i + 1; j < n; j++) {
            const p2 = getMarkerLatLng(markers[j]);
            const distance = map.distance(p1, p2);

            if (distance <= DISTANCE_THRESHOLD_METERS) {
                adjacency[i].push(j);
                adjacency[j].push(i);
            }
        }
    }

    return {
        adjacency: adjacency
    };
}

function findConnectedComponents(adjacency) {
    const n = adjacency.length;
    const visited = new Array(n).fill(false);
    const groups = [];

    for (let start = 0; start < n; start++) {
        if (visited[start]) {
            continue;
        }

        const stack = [start];
        visited[start] = true;
        const component = [];

        while (stack.length > 0) {
            const node = stack.pop();
            component.push(node);

            const neighbors = adjacency[node];
            for (let k = 0; k < neighbors.length; k++) {
                const next = neighbors[k];
                if (!visited[next]) {
                    visited[next] = true;
                    stack.push(next);
                }
            }
        }

        groups.push(component);
    }

    return groups;
}

function getOrderedGroupPoints(group) {
    const points = group.map(function (index) {
        return getMarkerLatLng(markers[index]);
    });

    let latSum = 0;
    let lngSum = 0;

    for (let i = 0; i < points.length; i++) {
        latSum += points[i].lat;
        lngSum += points[i].lng;
    }

    const centroid = L.latLng(
        latSum / points.length,
        lngSum / points.length
    );

    points.sort(function (a, b) {
        const angleA = Math.atan2(a.lat - centroid.lat, a.lng - centroid.lng);
        const angleB = Math.atan2(b.lat - centroid.lat, b.lng - centroid.lng);
        return angleA - angleB;
    });

    return {
        points: points,
        centroid: centroid
    };
}

function drawGroupPolygons(groups) {
    const colors = ["#d94841", "#2f9e44", "#3b5bdb", "#f08c00", "#0b7285", "#9c36b5"];

    for (let g = 0; g < groups.length; g++) {
        const group = groups[g];
        const orderedGroup = getOrderedGroupPoints(group);
        const color = colors[g % colors.length];
        const groupName = "g" + (g + 1);

        L.polygon(
            orderedGroup.points,
            {
                color: color,
                weight: 2,
                fillColor: color,
                fillOpacity: 0.12
            }
        ).addTo(groupPolygonsLayer);

        L.marker(orderedGroup.centroid, {
            icon: L.divIcon({
                className: "group-label-marker",
                html: '<div class="group-label" style="--group-color:' + color + '">' + groupName + '</div>',
                iconSize: [1, 1],
                iconAnchor: [0, 0]
            })
        }).addTo(groupLabelsLayer);
    }
}

function renderGroupSummary(groups) {
    if (markers.length === 0) {
        groupSummaryEl.textContent = "No markers added.";
        return;
    }

    if (groups.length === 0) {
        groupSummaryEl.textContent = "No groups found.";
        return;
    }

    const lines = [];
    for (let g = 0; g < groups.length; g++) {
        const groupName = "g" + (g + 1);
        const markerNames = groups[g].map(function (index) {
            return markers[index].id;
        });
        lines.push(groupName + ": " + markerNames.join(", "));
    }

    groupSummaryEl.textContent = lines.join("\n");
}

function recomputeGroupsAndRender() {
    clearVisualLayers();

    if (markers.length === 0) {
        renderGroupSummary([]);
        return;
    }

    const graphResult = buildAdjacencyAndConnectedPairs();
    const groups = findConnectedComponents(graphResult.adjacency);

    drawGroupPolygons(groups);
    renderGroupSummary(groups);
}

map.on("click", function (event) {
    markerCount += 1;
    const markerId = "m" + markerCount;

    const marker = L.marker(event.latlng)
        .bindPopup(
            "Marker " + markerId +
            "<br>Lat: " + event.latlng.lat.toFixed(5) +
            "<br>Lng: " + event.latlng.lng.toFixed(5)
        )
        .bindTooltip(markerId, {
            permanent: true,
            direction: "top",
            offset: [0, -18],
            className: "marker-number-tooltip"
        })
        .addTo(map);

    markers.push({
        id: markerId,
        marker: marker
    });
});

document
    .getElementById("group-markers-btn")
    .addEventListener("click", function () {
        recomputeGroupsAndRender();
    });

document
    .getElementById("clear-markers-btn")
    .addEventListener("click", function () {
        for (let i = 0; i < markers.length; i++) {
            map.removeLayer(markers[i].marker);
        }

        markers.length = 0;
        markerCount = 0;

        clearVisualLayers();
        renderGroupSummary([]);
    });

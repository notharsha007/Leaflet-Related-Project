const map = L.map('map').setView([13.0827, 80.2707], 13);

L.tileLayer(
    'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',
    {
        attribution: '&copy; OpenStreetMap contributors'
    }
).addTo(map);

const markers = [];
const groupCircles = [];
let markerCount = 0;

function clearGroupCircles() {
    groupCircles.forEach(circle => {
        map.removeLayer(circle);
    });

    groupCircles.length = 0;
}

function groupMarkersIntoPairs() {
    clearGroupCircles();

    for (let index = 0; index < markers.length - 1; index += 2) {
        const firstPoint = markers[index].getLatLng();
        const secondPoint = markers[index + 1].getLatLng();

        const center = L.latLng(
            (firstPoint.lat + secondPoint.lat) / 2,
            (firstPoint.lng + secondPoint.lng) / 2
        );

        const radius = center.distanceTo(firstPoint);

        const circle = L.circle(center, {
            radius: radius,
            color: 'blue',
            weight: 2,
            fillColor: '#3388ff',
            fillOpacity: 0.15
        }).addTo(map);

        groupCircles.push(circle);
    }
}

map.on('click', (event) => {
    markerCount += 1;

    const marker = L.marker(event.latlng)
        .bindPopup(
            `Marker ${markerCount}<br>Lat: ${event.latlng.lat.toFixed(5)}<br>Lng: ${event.latlng.lng.toFixed(5)}`
        )
        .bindTooltip(String(markerCount), {
            permanent: true,
            direction: 'top',
            offset: [0, -18],
            className: 'marker-number-tooltip'
        })
        .addTo(map);

    markers.push(marker);
});

document
    .getElementById('group-markers-btn')
    .addEventListener('click', groupMarkersIntoPairs);

document
    .getElementById('clear-markers-btn')
    .addEventListener('click', () => {
        markers.forEach(marker => {
            map.removeLayer(marker);
        });

        markers.length = 0;
        markerCount = 0;
        clearGroupCircles();
    });
import createGlobe from 'https://esm.sh/cobe@0.1.2';

// FFC official Grand Prix coordinates (Latitude, Longitude)
export const FFC_CIRCUITS_DATA = [
    { id: "australia", name: "GP de Australia", circuit: "Melbourne Grand Prix Circuit", location: "Melbourne, Australia", round: "ROUND 01", date: "14 JUN", lat: -37.8136, lon: 144.9631 },
    { id: "malaysia", name: "GP de Malasia", circuit: "Sepang International Circuit", location: "Sepang, Malaysia", round: "ROUND 02", date: "28 JUN", lat: 2.7607, lon: 101.7374 },
    { id: "bahrain", name: "GP de Bahrein", circuit: "Bahrain International Circuit", location: "Sakhir, Bahrain", round: "ROUND 03", date: "12 JUL", lat: 25.9000, lon: 50.5122 },
    { id: "turkey", name: "GP de Turquía", circuit: "Istanbul Park", location: "Istanbul, Turkey", round: "ROUND 04", date: "19 JUL", lat: 40.9517, lon: 29.4050 },
    { id: "spain", name: "GP de España", circuit: "Circuit de Barcelona-Catalunya", location: "Barcelona, Spain", round: "ROUND 05", date: "09 AGO", lat: 41.5700, lon: 2.2611 },
    { id: "italy", name: "GP de Italia", circuit: "Autodromo Nazionale di Monza", location: "Monza, Italy", round: "ROUND 06", date: "17 AGO", lat: 45.6189, lon: 9.2812 },
    { id: "austria", name: "GP de Austria", circuit: "Red Bull Ring", location: "Spielberg, Austria", round: "ROUND 07", date: "23 AGO", lat: 47.2197, lon: 14.7647 },
    { id: "silverstone", name: "GP de Gran Bretaña", circuit: "Silverstone Circuit", location: "Silverstone, UK", round: "ROUND 08", date: "07 SEP", lat: 52.0786, lon: -1.0169 },
    { id: "hockenheim", name: "GP de Alemania", circuit: "Hockenheimring", location: "Hockenheim, Germany", round: "ROUND 09", date: "13 SEP", lat: 49.3278, lon: 8.5658 },
    { id: "nurburgring", name: "GP de Europa", circuit: "Nürburgring GP", location: "Nürburg, Germany", round: "ROUND 10", date: "20 SEP", lat: 50.3341, lon: 6.9427 },
    { id: "hungary", name: "GP de Hungría", circuit: "Hungaroring", location: "Budapest, Hungary", round: "ROUND 11", date: "TBA", lat: 47.5830, lon: 19.2486 },
    { id: "belgium", name: "GP de Bélgica", circuit: "Circuit de Spa-Francorchamps", location: "Spa, Belgium", round: "ROUND 12", date: "TBA", lat: 50.4372, lon: 5.9714 },
    { id: "singapore", name: "GP de Singapur", circuit: "Marina Bay Street Circuit", location: "Marina Bay, Singapore", round: "ROUND 13", date: "TBA", lat: 1.2914, lon: 103.8644 },
    { id: "cota", name: "GP de Estados Unidos", circuit: "Circuit of the Americas", location: "Austin, USA", round: "ROUND 14", date: "TBA", lat: 30.1328, lon: -97.6411 },
    { id: "brazil", name: "GP de Brasil", circuit: "Autódromo José Carlos Pace", location: "Interlagos, Brazil", round: "ROUND 15", date: "TBA", lat: -23.7036, lon: -46.6997 }
];

// Mathematical 3D projection helper matching COBE's exact WebGL shader transformation
function project(lat, lon, phi, theta, r) {
    const latRad = (lat * Math.PI) / 180;
    const lonRad = (lon * Math.PI) / 180 - Math.PI;
    
    // Position of the marker on the unit sphere in COBE's coordinate system
    const cos_lat = Math.cos(latRad);
    const jx = -cos_lat * Math.cos(lonRad);
    const jy = Math.sin(latRad);
    const jz = cos_lat * Math.sin(lonRad);
    
    // COBE's WebGL shader rotations
    const cos_phi = Math.cos(phi);
    const sin_phi = Math.sin(phi);
    const cos_theta = Math.cos(theta);
    const sin_theta = Math.sin(theta);
    
    // Inverse transformation of G(phi, theta) matrix from the WebGL fragment shader
    const cx = jx * cos_theta + jz * sin_theta;
    const cy = jx * sin_theta * sin_phi + jy * cos_phi - jz * cos_theta * sin_phi;
    const cz = -jx * sin_theta * cos_phi + jy * sin_phi + jz * cos_theta * cos_phi;
    
    // COBE sphere scale is exactly 0.8 of half-width (r).
    const scale = 0.8;
    const screenX = r + cx * r * scale;
    const screenY = r - cy * r * scale;
    
    // Only show labels when on the front-facing hemisphere of the globe
    return { x: screenX, y: screenY, visible: cz > 0.05 };
}

export function initCobeGlobe(containerId) {
    const container = document.getElementById(containerId);
    if (!container) return;

    // Clear previous children
    container.innerHTML = "";

    // Build internal canvas
    const canvas = document.createElement("canvas");
    canvas.style.width = "100%";
    canvas.style.height = "100%";
    canvas.style.opacity = "0";
    canvas.style.transition = "opacity 1.2s ease";
    canvas.style.cursor = "grab";
    canvas.style.touchAction = "none";
    canvas.style.borderRadius = "50%";
    container.appendChild(canvas);

    let pointerInteracting = null;
    let lastPointer = null;
    let dragOffset = { phi: 0, theta: 0 };
    let velocity = { phi: 0, theta: 0 };
    let phiOffset = 3.8;
    let thetaOffset = 0.15;
    let isPaused = false;
    let focusedCircuit = null;

    const handlePointerDown = (e) => {
        pointerInteracting = { x: e.clientX, y: e.clientY };
        canvas.style.cursor = "grabbing";
        isPaused = true;
    };

    const handlePointerMove = (e) => {
        if (pointerInteracting !== null) {
            const deltaX = e.clientX - pointerInteracting.x;
            const deltaY = e.clientY - pointerInteracting.y;
            dragOffset = { phi: deltaX / 220, theta: deltaY / 440 };
            const now = Date.now();
            if (lastPointer) {
                const dt = Math.max(now - lastPointer.t, 1);
                const maxVelocity = 0.15;
                velocity = {
                    phi: Math.max(-maxVelocity, Math.min(maxVelocity, ((e.clientX - lastPointer.x) / dt) * 0.2)),
                    theta: Math.max(-maxVelocity, Math.min(maxVelocity, ((e.clientY - lastPointer.y) / dt) * 0.05))
                };
            }
            lastPointer = { x: e.clientX, y: e.clientY, t: now };
        }
    };

    const handlePointerUp = () => {
        if (pointerInteracting !== null) {
            phiOffset += dragOffset.phi;
            thetaOffset += dragOffset.theta;
            dragOffset = { phi: 0, theta: 0 };
            lastPointer = null;
        }
        pointerInteracting = null;
        canvas.style.cursor = "grab";
        isPaused = false;
    };

    canvas.addEventListener("pointerdown", handlePointerDown);
    window.addEventListener("pointermove", handlePointerMove, { passive: true });
    window.addEventListener("pointerup", handlePointerUp, { passive: true });

    let globe = null;
    let animationId;
    let phi = 0;

    function init() {
        const width = canvas.offsetWidth;
        if (width === 0 || globe) return;

        const dpr = Math.min(window.devicePixelRatio || 1, 2);
        
        const formattedMarkers = FFC_CIRCUITS_DATA.map(c => ({
            location: [c.lat, c.lon],
            size: 0.017,
            id: c.id
        }));

        const CIRCUIT_PIN_NAMES = {
            australia: "MELBOURNE",
            malaysia: "SEPANG",
            bahrain: "SAKHIR",
            turkey: "ESTAMBUL",
            spain: "BARCELONA",
            italy: "MONZA",
            austria: "SPIELBERG",
            silverstone: "SILVERSTONE",
            hockenheim: "HOCKENHEIM",
            nurburgring: "NÜRBURGRING",
            hungary: "BUDAPEST",
            belgium: "SPA",
            singapore: "SINGAPUR",
            cota: "AUSTIN",
            brazil: "SÃO PAULO"
        };

        function updatePanel(circuit) {
            const infoRound = document.getElementById("mapInfoRound");
            const infoGpName = document.getElementById("mapInfoGpName");
            const infoDate = document.getElementById("mapInfoDate");
            const infoCircuit = document.getElementById("mapInfoCircuit");

            if (infoRound) infoRound.textContent = circuit.round;
            if (infoGpName) infoGpName.textContent = circuit.name;
            if (infoDate) infoDate.textContent = circuit.date;
            if (infoCircuit) {
                infoCircuit.innerHTML = `<span style="color:var(--gold); font-weight:700;">${circuit.circuit}</span> · ${circuit.location}`;
            }
        }



        globe = createGlobe(canvas, {
            devicePixelRatio: dpr,
            width: width * dpr,
            height: width * dpr,
            phi: 3.8,
            theta: 0.15,
            dark: 1,
            diffuse: 1.2,
            mapSamples: 16000,
            mapBrightness: 6,
            baseColor: [0.1, 0.15, 0.25], 
            markerColor: [0.0, 0.85, 1.0], 
            glowColor: [0.15, 0.22, 0.35], 
            markerElevation: 0.15,
            markers: formattedMarkers,
            opacity: 0.9,
            onRender: (state) => {
                if (!isPaused) {
                    phi += 0.003; 
                    
                    if (Math.abs(velocity.phi) > 0.0001 || Math.abs(velocity.theta) > 0.0001) {
                        phiOffset += velocity.phi;
                        thetaOffset += velocity.theta;
                        velocity.phi *= 0.95;
                        velocity.theta *= 0.95;
                    }

                    const thetaMin = -0.5, thetaMax = 0.5;
                    if (thetaOffset < thetaMin) {
                        thetaOffset += (thetaMin - thetaOffset) * 0.1;
                    } else if (thetaOffset > thetaMax) {
                        thetaOffset += (thetaMax - thetaOffset) * 0.1;
                    }
                }

                const currentPhi = phi + phiOffset + dragOffset.phi;
                const currentTheta = thetaOffset + dragOffset.theta;
                
                state.phi = currentPhi;
                state.theta = currentTheta;

                // Calculate which circuit is closest to the front of the screen view
                const centerLon = (((-currentPhi + Math.PI) % (Math.PI * 2)) * 180) / Math.PI;
                let closest = null;
                let minDiff = Infinity;

                FFC_CIRCUITS_DATA.forEach(c => {
                    let diff = Math.abs(c.lon - centerLon);
                    if (diff > 180) diff = 360 - diff;
                    if (diff < minDiff) {
                        minDiff = diff;
                        closest = c;
                    }
                });

                if (closest && (!focusedCircuit || focusedCircuit.id !== closest.id)) {
                    focusedCircuit = closest;
                    updatePanel(closest);
                }


            }
        });

        canvas.style.opacity = "1";
    }

    const ro = new ResizeObserver((entries) => {
        if (entries[0]?.contentRect.width > 0) {
            ro.disconnect();
            init();
        }
    });
    ro.observe(canvas);

    // Return custom cleanup function to call on unload if needed
    return () => {
        if (animationId) cancelAnimationFrame(animationId);
        if (globe) globe.destroy();
        canvas.removeEventListener("pointerdown", handlePointerDown);
        window.removeEventListener("pointermove", handlePointerMove);
        window.removeEventListener("pointerup", handlePointerUp);
    };
}

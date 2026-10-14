let createGlobePromise = null;
function getCreateGlobe() {
    if (!createGlobePromise) {
        createGlobePromise = import('https://esm.sh/cobe@0.1.2').then(m => m.default || m).catch(() => {
            console.warn("esm.sh failed for cobe, falling back to jsDelivr...");
            return import('https://cdn.jsdelivr.net/npm/cobe@0.1.2/+esm').then(m => m.default || m);
        });
    }
    return createGlobePromise;
}

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
    { id: "hungary", name: "GP de Hungría", circuit: "Hungaroring", location: "Budapest, Hungary", round: "ROUND 11", date: "27 SEP", lat: 47.5830, lon: 19.2486 },
    { id: "belgium", name: "GP de Bélgica", circuit: "Circuit de Spa-Francorchamps", location: "Spa, Belgium", round: "ROUND 12", date: "11 OCT", lat: 50.4372, lon: 5.9714 },
    { id: "fuji", name: "GP de Fuji", circuit: "Fuji Speedway", location: "Oyama, Japón", round: "ROUND 13", date: "18 OCT", lat: 35.3717, lon: 138.9272 },
    { id: "cota", name: "GP de Estados Unidos", circuit: "Circuit of the Americas", location: "Austin, USA", round: "ROUND 14", date: "TBA", lat: 30.1328, lon: -97.6411 },
    { id: "brazil", name: "GP de Brasil", circuit: "Autódromo José Carlos Pace", location: "Interlagos, Brazil", round: "ROUND 15", date: "TBA", lat: -23.7036, lon: -46.6997 }
];

export function initCobeGlobe(containerId) {
    const container = document.getElementById(containerId);
    if (!container) return;

    container.innerHTML = "";

    const canvas = document.createElement("canvas");
    canvas.style.width = "100%";
    canvas.style.height = "100%";
    canvas.style.opacity = "0";
    canvas.style.transition = "opacity 1.2s ease";
    canvas.style.cursor = "grab";
    canvas.style.touchAction = "pan-y";
    canvas.style.borderRadius = "50%";
    container.appendChild(canvas);

    let pointerInteracting = null;
    let lastPointer = null;
    let dragOffset = { phi: 0, theta: 0 };
    let velocity = { phi: 0, theta: 0 };
    let phiOffset = 3.8;
    let thetaOffset = 0.15;
    let isPaused = false;
    let isVisibleInViewport = true;
    let focusedCircuit = null;

    const io = new IntersectionObserver((entries) => {
        isVisibleInViewport = entries[0]?.isIntersecting && !document.hidden;
    }, { threshold: 0.05 });
    io.observe(container);

    const handleVisibilityChange = () => {
        if (document.hidden) {
            isVisibleInViewport = false;
        } else {
            const rect = container.getBoundingClientRect();
            isVisibleInViewport = rect.bottom > 0 && rect.top < window.innerHeight;
        }
    };
    document.addEventListener("visibilitychange", handleVisibilityChange);

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

    // Requirement 4: Handle WebGL context lost gracefully
    canvas.addEventListener("webglcontextlost", (e) => {
        e.preventDefault();
        console.warn("WebGL context lost on CobeGlobe canvas. Attempting to recreate...");
        if (globe) {
            try { globe.destroy(); } catch (err) {}
            globe = null;
        }
        setTimeout(() => init(), 500);
    }, false);

    let globe = null;
    let animationId;
    let phi = 0;

    function init() {
        const width = canvas.offsetWidth || container.clientWidth || 500;
        if (width === 0 || globe) return;

        const dpr = Math.min(window.devicePixelRatio || 1, 2);
        
        const formattedMarkers = FFC_CIRCUITS_DATA.map(c => ({
            location: [c.lat, c.lon],
            size: 0.017,
            id: c.id
        }));

        function updatePanel(circuit) {
            const infoRound = document.getElementById("mapInfoRound");
            const infoGpName = document.getElementById("mapInfoGpName");
            const infoDate = document.getElementById("mapInfoDate");
            const infoCircuit = document.getElementById("mapInfoCircuit");

            if (infoRound) infoRound.textContent = circuit.round;
            if (infoGpName) infoGpName.textContent = circuit.name;
            if (infoDate) infoDate.textContent = circuit.date;
            if (infoCircuit) {
                infoCircuit.textContent = "";
                const circuitSpan = document.createElement("span");
                circuitSpan.style.color = "var(--gold)";
                circuitSpan.style.fontWeight = "700";
                circuitSpan.textContent = circuit.circuit;
                infoCircuit.appendChild(circuitSpan);
                infoCircuit.appendChild(document.createTextNode(` · ${circuit.location}`));
            }
        }

        getCreateGlobe().then(createGlobeFn => {
            if (!createGlobeFn || globe) return;
            globe = createGlobeFn(canvas, {
                devicePixelRatio: dpr,
                width: width * dpr,
                height: width * dpr,
                phi: 3.8,
                theta: 0.15,
                dark: 1,
                diffuse: 1.4,
                mapSamples: window.innerWidth < 768 ? 8000 : 14000,
                mapBrightness: 10,
                baseColor: [0.18, 0.25, 0.40], 
                markerColor: [0.0, 0.9, 1.0], 
                glowColor: [0.25, 0.35, 0.55], 
                markerElevation: 0.15,
                markers: formattedMarkers,
                opacity: 1,
                onRender: (state) => {
                    if (!isVisibleInViewport) return;
                    if (!isPaused) {
                        phi += 0.0012; 
                        
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
        }).catch(err => {
            console.error("Error creating CobeGlobe instance:", err);
            canvas.style.opacity = "1";
        });
    }

    const ro = new ResizeObserver((entries) => {
        if (entries[0]?.contentRect.width > 0) {
            ro.disconnect();
            init();
        }
    });
    ro.observe(canvas);

    // Immediate check & fallback timers as requested in requirement 4
    if (canvas.offsetWidth > 0 || container.clientWidth > 0) {
        init();
    }
    setTimeout(() => {
        if (!globe) init();
    }, 250);
    setTimeout(() => {
        if (!globe) init();
    }, 1000);

    return () => {
        if (animationId) cancelAnimationFrame(animationId);
        if (globe) {
            try { globe.destroy(); } catch (e) {}
        }
        io.disconnect();
        document.removeEventListener("visibilitychange", handleVisibilityChange);
        canvas.removeEventListener("pointerdown", handlePointerDown);
        window.removeEventListener("pointermove", handlePointerMove);
        window.removeEventListener("pointerup", handlePointerUp);
    };
}

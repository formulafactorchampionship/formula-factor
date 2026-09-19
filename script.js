/* =========================================================
   FIREBASE FIRESTORE SETUP (MODULAR SDK v10 VIA CDN)
========================================================= */

import { initShapeWavesBackground } from "./ShapeWaves.js";
import { initCalendarBorderGlow } from "./BorderGlow.js";
import { initSideRaysBackground } from "./SideRays.js";
import { initCobeGlobe } from "./CobeGlobe.js";
import { initLightPillar } from "./LightPillar.js";

// Initialize interactive background layers
const handleInitBackgrounds = () => {
    initShapeWavesBackground();
    initCalendarBorderGlow();
    
    // Mount the React Bits SideRays component
    initSideRaysBackground("hero-siderays-bg", {
        speed: 2.5,
        rayColor1: "#d6b45c", // Gold accent
        rayColor2: "#00d2be", // High speed Mercedes teal / cyan
        intensity: 2.0,
        spread: 2.4,
        origin: "top-right",
        tilt: -5,
        saturation: 1.4,
        blend: 0.65,
        falloff: 1.5,
        opacity: 0.55
    });

    initSideRaysBackground("fantasy-siderays-bg", {
        speed: 1.8,
        rayColor1: "#d6b45c", // Gold accent
        rayColor2: "#10b981", // Turbo Mint accent
        intensity: 1.8,
        spread: 2.2,
        origin: "top-right",
        tilt: -8,
        saturation: 1.3,
        blend: 0.6,
        falloff: 1.6,
        opacity: 0.6
    });

    // Mount a single, continuous, unified LightPillar component for the entire wrapper
    initLightPillar("unified-lightpillar-bg", {
        topColor: "#f5e29f",    // Official FFC Light Gold/Yellow (#f5e29f)
        bottomColor: "#06080d", // Official page background color (#06080d) to fade beautifully into dark
        intensity: 0.65,        // Reduced for a much darker/subtle effect
        rotationSpeed: 0.45,    // Increased speed for a more energetic movement
        interactive: true,
        glowAmount: 0.005,      // Reduced glow spread
        pillarWidth: 1.1,       // Much thinner pillar
        pillarHeight: 0.35,
        noiseIntensity: 0.18,
        pillarRotation: 12,
        quality: "medium"
    });
};

if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", handleInitBackgrounds);
} else {
    handleInitBackgrounds();
}

import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js";
import {
    getFirestore,
    collection,
    doc,
    getDocs,
    getDoc,
    setDoc,
    updateDoc,
    deleteDoc,
    onSnapshot,
    writeBatch,
    query,
    where,
    limit,
    orderBy
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";
import {
    getAuth,
    signInWithEmailAndPassword,
    createUserWithEmailAndPassword,
    signOut,
    onAuthStateChanged,
    sendPasswordResetEmail,
    updateProfile
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js";

let firebaseConfig = {
  apiKey: "AIzaSyAS4RecsGAS4JWUn1d-9_VyqFRKmkF_CNs",
  authDomain: "formula-factor.firebaseapp.com",
  projectId: "formula-factor",
  storageBucket: "formula-factor.firebasestorage.app",
  messagingSenderId: "91130346513",
  appId: "1:91130346513:web:7be9ef155980eba95045b0",
  measurementId: "G-GHEET6HXNY"
};

try {
  const configRes = await fetch('/firebase-applet-config.json');
  if (configRes.ok && configRes.headers.get('content-type')?.includes('application/json')) {
    const customConfig = await configRes.json();
    firebaseConfig = { ...firebaseConfig, ...customConfig };
  }
} catch (e) {}

try {
  const envRes = await fetch('/api/config');
  if (envRes.ok && envRes.headers.get('content-type')?.includes('application/json')) {
    const envData = await envRes.json();
    if (envData.firebaseApiKey) {
      firebaseConfig.apiKey = envData.firebaseApiKey;
    }
  }
} catch (e) {}

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);
const auth = getAuth(app);

// In-Memory live Firestore synchronized state
let currentPilotos = [];
let isPilotosInitialLoaded = false;
let isCarrerasInitialLoaded = false;
let currentNextRace = null;
let currentSettings = null;
let currentOpenRaceKey = null;
const pendingTeamChanges = new Map();

function isNextRaceTbd(race = currentNextRace) {
    if (!race) return false;
    if (race.isTbd === true || race.isTbd === "true") return true;
    if (race.dateTime === "TBD" || race.dateTime === "TBA" || !race.dateTime) {
        return true;
    }
    if (typeof race.dateText === "string") {
        const dUpper = race.dateText.trim().toUpperCase();
        if (dUpper === "TBD" || dUpper === "TBA" || dUpper.startsWith("TBD") || dUpper.startsWith("TBA") || dUpper.includes("POR DETERMINAR") || dUpper.includes("POR CONFIRMAR") || dUpper.includes("TO BE DETERMINED")) {
            return true;
        }
    }
    return false;
}
window.isNextRaceTbd = isNextRaceTbd;

function getPilotDocId(driverName) {
    if (!driverName) return "pilot_" + Date.now();
    return driverName.trim().toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9_-]/g, '_') || ("pilot_" + Date.now());
}

function escapeHtml(str) {
    if (str === null || str === undefined) return "";
    return String(str)
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#039;");
}

function escapeHTML(str) {
    return escapeHtml(str);
}
window.escapeHtml = escapeHtml;
window.escapeHTML = escapeHTML;

/* =========================================================
   TIMEZONE & COUNTDOWN (MADRID BASE TIME)
========================================================= */

// Compute epoch milliseconds for a date/time assumed to be in Europe/Madrid timezone
function getMadridEpochMs(dateTimeStr) {
    if (!dateTimeStr) return NaN;
    if (dateTimeStr.includes('Z') || /[+-]\d{2}:?\d{2}$/.test(dateTimeStr)) {
        return new Date(dateTimeStr).getTime();
    }
    const cleanStr = dateTimeStr.replace(' ', 'T');
    const [datePart, timePart = "00:00"] = cleanStr.split('T');
    const parts = datePart.split('-').map(Number);
    if (parts.length < 3) return new Date(dateTimeStr).getTime();
    const year = parts[0];
    const month = parts[1];
    const day = parts[2];
    const [hour = 0, minute = 0] = timePart.split(':').map(Number);

    let guess = Date.UTC(year, month - 1, day, hour, minute);

    const formatter = new Intl.DateTimeFormat('en-US', {
        timeZone: 'Europe/Madrid',
        year: 'numeric',
        month: 'numeric',
        day: 'numeric',
        hour: 'numeric',
        minute: 'numeric',
        hour12: false
    });

    for (let i = 0; i < 3; i++) {
        const pArr = formatter.formatToParts(new Date(guess));
        const m = {};
        for (const p of pArr) m[p.type] = p.value;
        const mYear = parseInt(m.year, 10);
        const mMonth = parseInt(m.month, 10);
        const mDay = parseInt(m.day, 10);
        const mHour = parseInt(m.hour, 10) % 24;
        const mMin = parseInt(m.minute, 10);

        const targetDays = Date.UTC(year, month - 1, day) / 86400000;
        const actualDays = Date.UTC(mYear, mMonth - 1, mDay) / 86400000;
        const diffMinutes = (targetDays - actualDays) * 1440 + (hour * 60 + minute) - (mHour * 60 + mMin);
        if (diffMinutes === 0) break;
        guess += diffMinutes * 60000;
    }
    return guess;
}

function getSavedRaceTimestamp() {
    if (isNextRaceTbd(currentNextRace)) {
        return null;
    }
    if (currentNextRace && currentNextRace.dateTime && currentNextRace.dateTime !== "TBD" && currentNextRace.dateTime !== "TBA") {
        const parsed = getMadridEpochMs(currentNextRace.dateTime);
        if (!isNaN(parsed)) return parsed;
    }
    return getMadridEpochMs("2026-09-20T16:30");
}

let raceDate = getSavedRaceTimestamp();

function updateCountdown() {
    const daysEl = document.getElementById("days");
    const hoursEl = document.getElementById("hours");
    const minsEl = document.getElementById("mins");
    const secsEl = document.getElementById("secs");

    if (!daysEl || !hoursEl || !minsEl || !secsEl) return;

    if (isNextRaceTbd(currentNextRace) || raceDate === null || isNaN(raceDate)) {
        daysEl.textContent = "--";
        hoursEl.textContent = "--";
        minsEl.textContent = "--";
        secsEl.textContent = "--";
        return;
    }

    const now = Date.now();
    const difference = raceDate - now;

    if (difference <= 0) {
        daysEl.textContent = "00";
        hoursEl.textContent = "00";
        minsEl.textContent = "00";
        secsEl.textContent = "00";
        return;
    }

    const days = Math.floor(
        difference / (1000 * 60 * 60 * 24)
    );

    const hours = Math.floor(
        (difference / (1000 * 60 * 60)) % 24
    );

    const minutes = Math.floor(
        (difference / (1000 * 60)) % 60
    );

    const seconds = Math.floor(
        (difference / 1000) % 60
    );

    daysEl.textContent = String(days).padStart(2, "0");
    hoursEl.textContent = String(hours).padStart(2, "0");
    minsEl.textContent = String(minutes).padStart(2, "0");
    secsEl.textContent = String(seconds).padStart(2, "0");
}

updateCountdown();
setInterval(updateCountdown, 1000);


/* =========================================================
   NAVBAR
========================================================= */

const navbar = document.querySelector(".navbar");

if (navbar) {

    window.addEventListener("scroll", () => {

        if (window.scrollY > 30) {
            navbar.style.background = "rgba(5, 7, 10, 0.98)";
        } else {
            navbar.style.background = "rgba(7, 9, 13, 0.94)";
        }

    });

}


/* =========================================================
   MOBILE MENU
========================================================= */

const menuBtn = document.getElementById("menuBtn");
const navLinks = document.querySelector(".nav-links");

if (menuBtn && navLinks) {

    menuBtn.addEventListener("click", () => {
        navLinks.classList.toggle("mobile-open");
    });

    document.querySelectorAll(".nav-links a").forEach((link) => {

        link.addEventListener("click", () => {
            navLinks.classList.remove("mobile-open");
        });

    });

}


/* =========================================================
   INTERNATIONALIZATION (i18n) — ES / EN
========================================================= */

const translations = {
    es: {
        nav: {
            home: "INICIO",
            standings: "CLASIFICACIÓN",
            calendar: "CALENDARIO",
            races: "CARRERAS",
            news: "NOTICIAS",
            info: "INFORMACIÓN",
            compare: "COMPARADOR",
            fantasy: "FANTASY"
        },
        hero: {
            eyebrow: "TEMPORADA 1 FORMULA FACTOR CHAMPIONSHIP",
            title: "CORRE RUEDA A RUEDA<br>EN LA PARRILLA <span class=\"gold-text-glow\">FFC</span>",
            tagGps: "15 GRANDES PREMIOS",
            tagDrivers: "44 PILOTOS INSCRITOS",
            tagChampion: "1 CAMPEÓN FFC",
            description: "Una liga de sim racing competitiva, limpia y abierta a pilotos que quieren correr, competir y disfrutar del motorsport.",
            btnStandings: "VER CLASIFICACIÓN",
            btnCalendar: "VER CALENDARIO"
        },
        live: {
            badge: "EN DIRECTO",
            title: "ESTAMOS EN DIRECTO",
            subtitle: "Sigue la retransmisión oficial de la carrera en vivo por Twitch.",
            watchOnTwitch: "VER EN TWITCH.TV ↗",
            btnStandings: "VER CLASIFICACIÓN",
            btnCalendar: "VER CALENDARIO",
            chatBadge: "EN DIRECTO",
            chatSuffix: "CHAT EN VIVO",
            chatPopout: "CHAT DE TWITCH ↗"
        },
        nextRace: {
            cardTop: "PRÓXIMA CARRERA",
            nextLabel: "SIGUIENTE RONDA",
            raceStartTime: "HORA DE INICIO",
            circuitDetails: "DETALLES DEL CIRCUITO Y EVENTO",
            days: "DÍAS",
            hours: "HRS",
            mins: "MIN",
            secs: "SEG"
        },
        stats: {
            season: "TEMPORADA",
            rounds: "RONDAS",
            racing: "COMPETICIÓN",
            drivers: "PILOTOS"
        },
        standings: {
            kicker: "CAMPEONATO",
            heading: "CLASIFICACIÓN",
            sub: "Clasificación del campeonato Temporada 1",
            driverTitle: "CAMPEONATO DE PILOTOS",
            driverRoundPrefix: "TRAS RONDA 9",
            pointsHeader: "PUNTOS",
            thPos: "POS.",
            thDriver: "PILOTO",
            thTeam: "EQUIPO",
            thPts: "PTS",
            teamTitle: "CAMPEONATO DE CONSTRUCTORES",
            teamRoundPrefix: "TRAS RONDA 9",
            teamPointsHeader: "PUNTOS",
            thTeamPos: "POS.",
            thTeamName: "EQUIPO",
            thTeamPoints: "PUNTOS",
            thTeamDiff: "DIF."
        },
        calendar: {
            kicker: "TEMPORADA 1",
            heading: "CALENDARIO",
            sub: "Calendario de la temporada 2026",
            statusMap: {
                "TEST DAYS": "DÍAS DE TEST",
                "COMPLETED": "COMPLETADA",
                "NEXT RACE": "PRÓXIMA CARRERA",
                "UPCOMING": "PRÓXIMAMENTE",
                "FINAL ROUND": "RONDA FINAL"
            },
            viewResults: "RESULTADOS →",
            thisWeekend: "ESTE FIN DE SEMANA",
            countries: {
                "SPAIN": "ESPAÑA",
                "AUSTRALIA": "AUSTRALIA",
                "MALAYSIA": "MALASIA",
                "BAHRAIN": "BARÉIN",
                "TURKEY": "TURQUÍA",
                "ITALY": "ITALIA",
                "AUSTRIA": "AUSTRIA",
                "UNITED KINGDOM": "REINO UNIDO",
                "GERMANY": "ALEMANIA",
                "EUROPE": "EUROPA",
                "HUNGARY": "HUNGRÍA",
                "BELGIUM": "BÉLGICA",
                "SINGAPORE": "SINGAPUR",
                "USA": "ESTADOS UNIDOS",
                "BRAZIL": "BRASIL"
            }
        },
        races: {
            kicker: "FIN DE SEMANA DE CARRERA",
            heading: "CARRERAS",
            sub: "Sigue el campeonato",
            round: "RONDA",
            nextEvent: "PRÓXIMO EVENTO"
        },
        info: {
            heading: "INFORMACIÓN",
            p1: "Formula Factor Championship es una competición en Assetto Corsa diseñada para reunir a pilotos amantes de la simulación y del automovilismo, especialmente de la Fórmula 1 de las eras V8 y V10.",
            p2: "Este campeonato ofrece carreras competitivas y de alto realismo. Buscamos recrear la experiencia de un campeonato profesional de motorsport. A lo largo de la temporada, los pilotos deberán demostrar no solo velocidad, sino también constancia, estrategia y capacidad de adaptación para alzarse con el título.",
            p3: "El campeonato constará de diversas citas en diferentes circuitos, con un sistema de puntuación basado en el sistema oficial de la Fórmula 1. Además, se promueve el respeto entre pilotos, el juego limpio en pista y una comunidad sana donde disfrutar de carreras igualadas.",
            card1Title: "Simulación Realista",
            card1Desc: "Físicas de competición y configuración profesional de monoplazas para recrear la exigencia real de un campeonato del mundo de motorsport.",
            card2Title: "Sistema Oficial F1",
            card2Desc: "Sistema de puntuación oficial de la FIA, donde cada punto cuenta y la constancia en pista premia al verdadero campeón de la temporada.",
            card3Title: "Fair Play y Respeto",
            card3Desc: "Promovemos el juego limpio, el compañerismo y el respeto absoluto en pista para disfrutar de batallas rueda a rueda memorables y seguras.",
            card4Title: "Comunidad Activa",
            card4Desc: "Organización profesional con transmisiones en directo, mercado de fichajes Fantasy y gestión centralizada a través de nuestra comunidad en Discord.",
            disclaimerHtml: "<strong>Aviso Importante:</strong> Es imprescindible formar parte del servidor oficial de Discord para estar al día de los comunicados, normativas y fichajes de equipos.",
            socialsKicker: "ENLACES OFICIALES Y REDES SOCIALES"
        },
        modal: {
            closeLabel: "Cerrar resultados de carrera",
            winner: "GANADOR",
            pole: "POLE",
            fastest: "VUELTA RÁPIDA",
            driverDay: "PILOTO DEL DÍA",
            resultTitle: "RESULTADO DE CARRERA",
            resultSub: "CLASIFICADOS",
            thPos: "POS.",
            thDriver: "PILOTO",
            thTeam: "EQUIPO",
            thStatus: "ESTADO",
            backBtn: "← VOLVER AL CALENDARIO"
        },
        tz: {
            title: "ZONAS HORARIAS",
            baseTag: "BASE: MADRID",
            desc: "Selecciona tu zona horaria para ver la hora local",
            btnTitle: "Zona horaria (Hora base: Madrid)"
        },
        auth: {
            btnLabel: "INICIAR SESIÓN",
            badge: "FORMULA FACTOR // ACCESO DE PILOTO",
            tabLogin: "INICIAR SESIÓN",
            tabRegister: "REGISTRARSE",
            loginSub: "Introduce tu correo electrónico y contraseña para acceder a tu cuenta.",
            registerSub: "Crea tu cuenta de piloto en Formula Factor Championship.",
            resetSub: "Introduce tu correo para recibir un enlace oficial para restablecer tu contraseña.",
            labelEmail: "CORREO ELECTRÓNICO",
            labelPassword: "CONTRASEÑA",
            labelPasswordReg: "CONTRASEÑA (MÍNIMO 6 CARACTERES)",
            labelName: "NOMBRE / APODO DE PILOTO",
            forgotLink: "¿Olvidaste tu contraseña?",
            btnCancel: "CANCELAR",
            btnBack: "VOLVER",
            btnSubmitLogin: "INICIAR SESIÓN",
            btnSubmitRegister: "CREAR CUENTA",
            btnSubmitReset: "ENVIAR ENLACE",
            statusConnected: "CONECTADO",
            statusAdmin: "ADMINISTRADOR",
            adminPanelBtn: "PANEL DE CONTROL",
            btnLogout: "CERRAR SESIÓN",
            welcome: "Bienvenido"
        },
        claim: {
            title: "¿ERES PILOTO OFICIAL DE LA FFC?",
            desc: "Para obtener tu código de vinculación, debes <strong>abrir un ticket</strong> en el servidor oficial de Discord de la FFC. Los comisarios te entregarán tu código exclusivo.",
            ticketBtn: "Abrir Ticket en Discord FFC ↗",
            stepLabel: "¿YA TIENES TU CÓDIGO DEL TICKET?",
            codePlaceholder: "Código (ej: FF-8A9201)",
            submitBtn: "Vincular",
            verifiedTag: "PILOTO VERIFICADO",
            unlinkBtn: "🔓 Desvincular Piloto",
            customizeBtn: "🎨 Personalizar Tarjeta",
            viewCardBtn: "👁️ Ver Tarjeta"
        },
        cardEditor: {
            title: "🎨 PERSONALIZAR TU TARJETA DE PILOTO",
            desc: "Los cambios se guardarán en Firebase y se reflejarán públicamente en tu ficha de piloto.",
            previewLabel: "VISTA PREVIA EN TIEMPO REAL DE TU TARJETA",
            liveBadge: "EN VIVO",
            verifiedTag: "VERIFICADO ✅",
            group1: "COLOR DE TU TARJETA & ESCUDERÍA",
            customColorLabel: "O elige cualquier color:",
            group2: "FOTO DE PERFIL O AVATAR",
            avatarPresetLabel: "Avatares FFC:",
            btnTriggerAvatarFile: "📁 Subir desde tu equipo (PC/Móvil)",
            avatarUploadOr: "o pega un enlace de imagen:",
            group3: "NACIONALIDAD OFICIAL DEL PILOTO",
            lockedBadge: "🔒 OFICIAL FFC",
            officialFlagNotice: "El país está fijado por la FIA/FFC en base a tu inscripción oficial y no se puede modificar.",
            group4: "BIOGRAFÍA Y PERIFÉRICOS",
            bioSuggestLabel: "Ideas rápidas:",
            bioPlaceholder: "Resumen de tu estilo de conducción, periféricos, aspiraciones en FFC...",
            group5: "REDES SOCIALES & CONTACTO",
            saveBtn: "⚡ Guardar Cambios en Firebase",
            viewBtn: "👁️ Ver Tarjeta"
        },
        fantasy: {
            backBtn: "Volver a la Web Principal",
            statusLive: "● EN VIVO",
            seasonBadge: "TEMPORADA 1 · OFICIAL",
            heroEyebrow: "🏆 FFC FANTASY LEAGUE · OFICIAL",
            heroTitle: "CREA TU <span class=\"gold-gradient\">ESCUDERÍA</span>",
            heroDesc: "Administra tu presupuesto de 75.0M€, ficha a 3 pilotos de la parrilla oficial y 1 constructor, y compite contra la comunidad sumando los puntos reales de cada Gran Premio disputado.",
            authTitle: "INICIA SESIÓN PARA JUGAR",
            authDesc: "Debes iniciar sesión con tu cuenta de Formula Factor para gestionar tus 75.0M€ de presupuesto, fichar pilotos y competir en la clasificación oficial.",
            loginPromptBtn: "Iniciar Sesión / Registrarse",
            lockedTitle: "MERCADO DE FICHAJES BLOQUEADO",
            lockedDesc: "Las alineaciones están congeladas durante la disputa del Gran Premio. No se permiten compras, ventas ni cambios de Turbo Driver hasta la reapertura del mercado.",
            lockedBadge: "🔴 CARRERA EN CURSO",
            hudBudgetLabel: "PRESUPUESTO DISPONIBLE",
            hudTeamValLabel: "VALOR DEL EQUIPO",
            hudPointsLabel: "PUNTOS FANTASY",
            hudRankLabel: "RANGO EN LIGA",
            hudTurboSub: "Incluye Turbo Driver (x2)",
            tabTeam: "Mi Escudería",
            tabMarket: "Mercado de Fichajes",
            tabLeaderboard: "Clasificación Fantasy",
            tabRules: "Reglamento & Puntos",
            teamNameLabel: "Nombre de tu Escudería:",
            teamNamePlaceholder: "Ej. Apex Factor Racing",
            saveBtn: "Guardar",
            resetBtn: "Reiniciar Equipo",
            goToMarketBtn: "+ Fichar en el Mercado",
            infoStripText: "<strong>Regla FFC Fantasy:</strong> Tu alineación debe incluir exactamente 3 pilotos y 1 constructor dentro del tope de 75.0M€. Pulsa el botón <strong>⭐ Turbo Driver</strong> en cualquiera de tus 3 pilotos para duplicar (x2) sus puntos en cada Gran Premio oficial.",
            filterAll: "Todos",
            filterDrivers: "Pilotos",
            filterTeams: "Constructores",
            filterRising: "🔥 En Alza (▲)",
            filterFalling: "📉 En Oferta (▼)",
            filterAffordable: "Asequibles (≤ Presupuesto)",
            searchPlaceholder: "Buscar por nombre o escudería...",
            sortPriceDesc: "Precio: Mayor a Menor",
            sortPriceAsc: "Precio: Menor a Mayor",
            sortRisingDesc: "Mayor Revalorización (▲ Subida)",
            sortFallingDesc: "Mayor Descuento (▼ Ganga)",
            sortPtsDesc: "Puntos: Más a Menos",
            sortNameAsc: "Nombre: A-Z",
            lbHeading: "Clasificación General FFC Fantasy",
            lbSub: "Ranking de directores de equipo y puntos acumulados en la Temporada 1 oficial.",
            thPos: "POS",
            thTeam: "ESCUDERÍA / MANAGER",
            thLineup: "ALINEACIÓN (3 PILOTOS + 1 CONSTRUCTOR)",
            thValue: "VALOR",
            thPoints: "PUNTOS",
            r1Title: "1. Presupuesto Inicial (75.0M €)",
            r1Text: "Dispones de 75.0M€ de presupuesto fijo. Los constructores son el activo principal (14.0M€ - 38.5M€) y los pilotos oscilan entre 6.0M€ y 29.7M€. Es imposible fichar a los mejores pilotos y al mejor equipo simultáneamente, obligándote a gestionar tu estrategia con fichajes equilibrados.",
            r2Title: "2. Estructura de la Escudería",
            r2Text: "Debes fichar exactamente <strong>3 pilotos oficiales</strong> y <strong>1 constructor</strong>. No se permiten pilotos duplicados en una misma alineación.",
            r3Title: "3. Turbo Driver (Multiplicador x2)",
            r3Text: "Selecciona a uno de tus 3 pilotos como <strong>Turbo Driver</strong>. Los puntos obtenidos por este piloto se multiplicarán por 2 (x2) en la puntuación total de tu escudería.",
            r4Title: "4. Inicio con 0 Puntos (A partir de Nürburgring)",
            r4Text: "Todos los equipos y participantes comienzan la liga Fantasy con <strong>0 puntos</strong>. Las puntuaciones se acumularán a partir del Gran Premio de Nürburgring (Round 10) y siguientes rondas de la temporada con los puntos reales que consigan tus pilotos y constructor en cada carrera oficial.",
            r5Title: "5. Mercado de Traspasos Libre",
            r5Text: "Puedes vender y cambiar pilotos y constructores en cualquier momento entre carreras. Al vender un piloto recuperas el 100% de su valor actual para reinvertirlo en nuevos talentos.",
            r6Title: "6. Guardado en Tu Perfil",
            r6Text: "Si has iniciado sesión con tu cuenta, tu escudería se sincroniza automáticamente con la nube en Firestore, manteniéndose guardada y visible en la clasificación comunitaria.",
            r7Title: "7. Fluctuación Dinámica de Precios & Plusvalías",
            r7Text: "El precio de mercado de cada piloto y constructor sube (<strong>▲ +0.1M€ a +1.0M€</strong>) o baja (<strong>▼ -0.1M€ a -0.6M€</strong>) tras cada Gran Premio oficial según su rendimiento real. Si fichas a un piloto antes de una gran actuación y su valor se dispara, al venderlo recuperarás su <strong>nuevo precio de mercado</strong>, aumentando el presupuesto total de tu escudería."
        },
        news: {
            kicker: "ACTUALIDAD • COMUNIDAD FFC",
            heading: "NOTICIAS Y <span class=\"gold-gradient\">NOVEDADES</span>",
            description: "Sigue de cerca las crónicas oficiales de carrera, anuncios de fichajes, comunicados de pilotos y artículos aportados por la comunidad. ¡Envía tu propia noticia para que sea publicada!",
            catAll: "Todas",
            catRaces: "🏆 Carreras",
            catTransfers: "🔄 Fichajes",
            catDrivers: "🏎️ Pilotos",
            catReports: "📝 Crónicas",
            catCommunity: "👥 Comunidad",
            catTech: "⚙️ Técnica",
            searchPlaceholder: "Buscar noticias...",
            btnSubmit: "Enviar Noticia",
            emptyTitleFiltered: "No se encontraron noticias",
            emptyDescFiltered: "No hay artículos que coincidan con los filtros o la búsqueda seleccionada.",
            emptyTitleNoArticles: "Todavía no hay noticias publicadas",
            emptyDescNoArticles: "¡Sé el primero en proponer un artículo o redactar un comunicado oficial para la comunidad!",
            btnResetFilters: "Ver todas las noticias",
            modalBadge: "PRENSA • COMUNIDAD FFC",
            modalTitle: "✍️ ENVIAR NOTICIA A LA COMUNIDAD",
            modalSubtitle: "Comparte una crónica de carrera, un análisis técnico, un comunicado de escudería o un artículo. Una vez revisada y aprobada por los administradores, se publicará en la web oficial.",
            labelTitle: 'Título de la Noticia <span class="required-star">*</span>',
            placeholderTitle: "Ej: Espectacular remontada de Dieguiosk en Monza bajo la lluvia",
            labelCategory: 'Categoría <span class="required-star">*</span>',
            catOptionRaces: "🏆 Carreras",
            catOptionTransfers: "🔄 Fichajes",
            catOptionDrivers: "🏎️ Pilotos",
            catOptionReports: "📝 Crónicas",
            catOptionCommunity: "👥 Comunidad",
            catOptionTech: "⚙️ Análisis Técnico",
            labelAuthor: 'Autor (Tu Usuario) <span class="required-star">*</span>',
            placeholderAuthor: "Nombre de tu cuenta registrada",
            labelSummary: "Resumen Breve (1-2 frases)",
            placeholderSummary: "Una breve descripción que aparecerá en la portada de la noticia (opcional)",
            labelImage: "URL de Imagen de Portada (Opcional)",
            btnPresetImg: "Fondo FFC",
            hintImage: "Si lo dejas vacío, se asignará automáticamente un fondo oficial de Formula Factor.",
            labelContent: 'Contenido Completo del Artículo <span class="required-star">*</span>',
            placeholderContent: "Escribe aquí tu crónica, declaraciones, sensaciones de carrera o artículo completo...",
            hintContent: "Puedes separar tus ideas en distintos párrafos. Se respetarán los saltos de línea al publicarse.",
            moderationNotice: "<strong>Aviso de Moderación:</strong> Todas las noticias pasan por un proceso de revisión por los administradores antes de ser visibles públicamente para asegurar la calidad y el respeto en la liga.",
            btnCancel: "Cancelar",
            btnSubmitAction: "<span>🚀</span> Enviar para Revisión",
            btnEditArticle: "✏️ Editar Noticia",
            shareBtn: "🔗 Copiar enlace",
            commentsHeading: "💬 COMENTARIOS DE LA COMUNIDAD",
            commentAuthorPlaceholder: "Tu nombre / apodo",
            commentTextPlaceholder: "Escribe un comentario sobre esta noticia...",
            commentSubmitBtn: "<span>💬</span> Publicar Comentario",
            noComments: "No hay comentarios todavía. ¡Sé el primero en opinar sobre esta noticia!",
            officialBadge: "OFICIAL FFC",
            compare: {
                title: "⚔️ COMPARADOR DE PILOTOS",
                sub: "Análisis cara a cara: duelo directo en pista, puntos, victorias, ritmo y fiabilidad",
                presets: "DUELOS RECOMENDADOS:",
                driverA: "PILOTO A (ESQUINA ROJA)",
                driverB: "PILOTO B (ESQUINA AZUL)",
                swapTitle: "Intercambiar pilotos",
                modeMutual: "SOLO CARRERAS COINCIDENTES (JUSTO)",
                modeMutualTitle: "Solo evalúa Grandes Premios donde ambos pilotos tomaron la salida",
                modeAll: "TEMPORADA COMPLETA (15 GPs)",
                modeAllTitle: "Evalúa las 15 rondas del calendario de la temporada completa",
                modeInfoMutual: "Modo Justo activo: Se analizan exclusivamente las carreras donde ambos compitieron en pista. Las ausencias no otorgan victorias al rival.",
                modeInfoAll: "Modo Temporada Completa activo: Se evalúan todas las rondas del calendario (15 GPs). Las ausencias cuentan como victoria para el piloto presente.",
                h2hVerdict: "DUELO DIRECTO EN PISTA",
                h2hSub: "Carreras terminadas por delante",
                metricsTitle: "COMPARATIVA ESTADÍSTICA DETALLADA",
                metricsSub: "TEMPORADA FFC 2010 OFICIAL",
                skillsTitle: "ÍNDICE DE RENDIMIENTO & DESTREZAS",
                skillsSub: "MÉTRICAS NORMALIZADAS DE PILOTAJE",
                roundsTitle: "DUELOS RONDA POR RONDA (R1 - R15)",
                roundsSub: "RESULTADOS DIRECTOS EN CADA GRAN PREMIO",
                thRound: "RONDA",
                thGp: "GRAN PREMIO",
                thDuel: "DUELO GP",
                thDiff: "DIF. PTS",
                tie: "Empate",
                noMatch: "Sin coincidencia",
                noMatchTitle: "Solo uno participó: no suma victoria en Modo Justo",
                didNotParticipate: "NO PARTICIPÓ",
                metrics: {
                    avgPts: "PROMEDIO PTS / GP",
                    mutualPts: "PUNTOS EN DUELOS DIRECTOS",
                    podiumEff: "EFECTIVIDAD EN PODIOS",
                    winEff: "EFECTIVIDAD EN VICTORIAS",
                    racesEntered: "CARRERAS DISPUTADAS",
                    totalPts: "PUNTOS TOTALES",
                    champPos: "POSICIÓN EN EL MUNDIAL",
                    poles: "POLE POSITIONS",
                    fastestLaps: "VUELTAS RÁPIDAS",
                    reliability: "FIABILIDAD EN CARRERA",
                    fantasyValue: "VALOR FANTASY FFC"
                },
                skills: {
                    racePace: "🏎️ RITMO DE CARRERA",
                    qualyPace: "⏱️ RITMO DE CLASIFICACIÓN",
                    reliability: "🛡️ FIABILIDAD MECÁNICA",
                    consistency: "🎯 REGULARIDAD EN TOP 10",
                    podiumEff: "🏆 EFECTIVIDAD EN PODIOS"
                }
            }
        }
    },
    en: {
        nav: {
            home: "HOME",
            standings: "STANDINGS",
            calendar: "CALENDAR",
            races: "RACES",
            news: "NEWS",
            info: "INFO",
            compare: "COMPARISON",
            fantasy: "FANTASY"
        },
        hero: {
            eyebrow: "SEASON 1 FORMULA FACTOR CHAMPIONSHIP",
            title: "RACE WHEEL-TO-WHEEL<br>ON THE <span class=\"gold-text-glow\">FFC GRID</span>",
            tagGps: "15 GRAND PRIX",
            tagDrivers: "44 REGISTERED DRIVERS",
            tagChampion: "1 FFC CHAMPION",
            description: "A competitive, clean sim racing league open to drivers who want to race, compete, and enjoy motorsport.",
            btnStandings: "VIEW STANDINGS",
            btnCalendar: "VIEW CALENDAR"
        },
        live: {
            badge: "LIVE NOW",
            title: "WE ARE LIVE",
            subtitle: "Watch the official championship race broadcast live on Twitch.",
            watchOnTwitch: "WATCH ON TWITCH.TV ↗",
            btnStandings: "VIEW STANDINGS",
            btnCalendar: "VIEW CALENDAR",
            chatBadge: "LIVE NOW",
            chatSuffix: "LIVE CHAT",
            chatPopout: "TWITCH CHAT ↗"
        },
        nextRace: {
            cardTop: "NEXT RACE",
            nextLabel: "NEXT ROUND",
            raceStartTime: "RACE START TIME",
            circuitDetails: "CIRCUIT & EVENT DETAILS",
            days: "DAYS",
            hours: "HRS",
            mins: "MIN",
            secs: "SEC"
        },
        stats: {
            season: "SEASON",
            rounds: "ROUNDS",
            racing: "RACING",
            drivers: "DRIVERS"
        },
        standings: {
            kicker: "CHAMPIONSHIP",
            heading: "STANDINGS",
            sub: "Season 1 championship classification",
            driverTitle: "DRIVER CHAMPIONSHIP",
            driverRoundPrefix: "AFTER ROUND 9",
            pointsHeader: "POINTS",
            thPos: "POS.",
            thDriver: "DRIVER",
            thTeam: "TEAM",
            thPts: "PTS",
            teamTitle: "CONSTRUCTOR CHAMPIONSHIP",
            teamRoundPrefix: "AFTER ROUND 9",
            teamPointsHeader: "POINTS",
            thTeamPos: "POS.",
            thTeamName: "TEAM",
            thTeamPoints: "POINTS",
            thTeamDiff: "DIFF."
        },
        calendar: {
            kicker: "SEASON 1",
            heading: "CALENDAR",
            sub: "2026 championship calendar",
            statusMap: {
                "TEST DAYS": "TEST DAYS",
                "COMPLETED": "COMPLETED",
                "NEXT RACE": "NEXT RACE",
                "UPCOMING": "UPCOMING",
                "FINAL ROUND": "FINAL ROUND"
            },
            viewResults: "RESULTS →",
            thisWeekend: "THIS WEEKEND",
            countries: {
                "SPAIN": "SPAIN",
                "AUSTRALIA": "AUSTRALIA",
                "MALAYSIA": "MALAYSIA",
                "BAHRAIN": "BAHRAIN",
                "TURKEY": "TURKEY",
                "ITALY": "ITALY",
                "AUSTRIA": "AUSTRIA",
                "UNITED KINGDOM": "UNITED KINGDOM",
                "GERMANY": "GERMANY",
                "EUROPE": "EUROPE",
                "HUNGARY": "HUNGARY",
                "BELGIUM": "BELGIUM",
                "SINGAPORE": "SINGAPORE",
                "USA": "USA",
                "BRAZIL": "BRAZIL"
            }
        },
        races: {
            kicker: "RACE WEEKEND",
            heading: "RACES",
            sub: "Follow the championship",
            round: "ROUND",
            nextEvent: "NEXT EVENT"
        },
        info: {
            heading: "INFO",
            p1: "Formula Factor Championship is a competition in Assetto Corsa designed to bring together drivers that love motorsport simulation, especially Formula 1 from the V8 and V10 eras.",
            p2: "This championship offers competitive and highly realistic races. We aim to recreate the experience of a professional motorsport championship. Throughout the season, drivers must demonstrate not only speed, but also consistency, strategy, and adaptability to win the championship title.",
            p3: "The championship will consist of several races held on different circuits, and the scoring system will be based on the current Formula 1 system. Furthermore, the championship promotes respect among drivers, fair play on the track, and the development of a community where participants can enjoy competitive racing in a fair and sporting environment.",
            card1Title: "Realistic Simulation",
            card1Desc: "Competitive physics and professional car setups designed to recreate the real-world demands of a professional motorsport world championship.",
            card2Title: "Official F1 System",
            card2Desc: "Official FIA scoring system where every point matters and consistency on track rewards the true champion of the season.",
            card3Title: "Fair Play & Respect",
            card3Desc: "We promote clean racing, camaraderie, and absolute mutual respect on track to ensure memorable and safe wheel-to-wheel battles.",
            card4Title: "Active Community",
            card4Desc: "Professional organization featuring live broadcasts, Fantasy transfer market, and centralized league management through our Discord hub.",
            disclaimerHtml: "<strong>Important Notice:</strong> Joining the official Discord server is mandatory to stay updated on league announcements, regulations, and team signings.",
            socialsKicker: "OFFICIAL LINKS & SOCIAL MEDIA"
        },
        modal: {
            closeLabel: "Close race results",
            winner: "WINNER",
            pole: "POLE",
            fastest: "FASTEST LAP",
            driverDay: "DRIVER OF THE DAY",
            resultTitle: "RACE RESULT",
            resultSub: "CLASSIFIED",
            thPos: "POS.",
            thDriver: "DRIVER",
            thTeam: "TEAM",
            thStatus: "STATUS",
            backBtn: "← BACK TO CALENDAR"
        },
        tz: {
            title: "TIME ZONES",
            baseTag: "BASE: MADRID",
            desc: "Select your timezone to view local times",
            btnTitle: "Time zone (Base: Madrid time)"
        },
        auth: {
            btnLabel: "LOG IN",
            badge: "FORMULA FACTOR // DRIVER ACCESS",
            tabLogin: "LOG IN",
            tabRegister: "REGISTER",
            loginSub: "Enter your email and password to access your driver account.",
            registerSub: "Create your driver account on Formula Factor Championship.",
            resetSub: "Enter your email to receive an official password reset link.",
            labelEmail: "EMAIL ADDRESS",
            labelPassword: "PASSWORD",
            labelPasswordReg: "PASSWORD (MIN. 6 CHARACTERS)",
            labelName: "DRIVER NAME / ALIAS",
            forgotLink: "Forgot your password?",
            btnCancel: "CANCEL",
            btnBack: "BACK",
            btnSubmitLogin: "LOG IN",
            btnSubmitRegister: "CREATE ACCOUNT",
            btnSubmitReset: "SEND RESET LINK",
            statusConnected: "CONNECTED",
            statusAdmin: "ADMINISTRATOR",
            adminPanelBtn: "ADMIN PANEL",
            btnLogout: "LOG OUT",
            welcome: "Welcome"
        },
        claim: {
            title: "ARE YOU AN OFFICIAL FFC DRIVER?",
            desc: "To get your linking code, you must <strong>open a ticket</strong> on the official FFC Discord server. Stewards will issue your exclusive code.",
            ticketBtn: "Open Ticket on FFC Discord ↗",
            stepLabel: "ALREADY HAVE YOUR TICKET CODE?",
            codePlaceholder: "Code (e.g. FF-8A9201)",
            submitBtn: "Link",
            verifiedTag: "VERIFIED DRIVER",
            unlinkBtn: "🔓 Unlink Driver",
            customizeBtn: "🎨 Customize Card",
            viewCardBtn: "👁️ View Card"
        },
        cardEditor: {
            title: "🎨 CUSTOMIZE YOUR DRIVER CARD",
            desc: "Changes will be saved to Firebase and reflected publicly on your driver card.",
            previewLabel: "REAL-TIME PREVIEW OF YOUR CARD",
            liveBadge: "LIVE",
            verifiedTag: "VERIFIED ✅",
            group1: "CARD & TEAM COLOR",
            customColorLabel: "Or choose any color:",
            group2: "PROFILE PHOTO OR AVATAR",
            avatarPresetLabel: "FFC Avatars:",
            btnTriggerAvatarFile: "📁 Upload from device (PC/Mobile)",
            avatarUploadOr: "or paste an image link:",
            group3: "OFFICIAL DRIVER NATIONALITY",
            lockedBadge: "🔒 OFFICIAL FFC",
            officialFlagNotice: "Nationality is set by the FIA/FFC based on your official entry and cannot be modified.",
            group4: "BIOGRAPHY & PERIPHERALS",
            bioSuggestLabel: "Quick ideas:",
            bioPlaceholder: "Summary of your driving style, peripherals, aspirations in FFC...",
            group5: "SOCIAL MEDIA & CONTACT",
            saveBtn: "⚡ Save Changes to Firebase",
            viewBtn: "👁️ View Card"
        },
        fantasy: {
            backBtn: "Back to Main Site",
            statusLive: "● LIVE",
            seasonBadge: "SEASON 1 · OFFICIAL",
            heroEyebrow: "🏆 FFC FANTASY LEAGUE · OFFICIAL",
            heroTitle: "CREATE YOUR <span class=\"gold-gradient\">TEAM</span>",
            heroDesc: "Manage your €75.0M budget, sign 3 drivers from the official grid and 1 constructor, and compete against the community scoring real points from each Grand Prix.",
            authTitle: "LOG IN TO PLAY",
            authDesc: "You must log in with your Formula Factor account to manage your €75.0M budget, sign drivers, and compete in the official standings.",
            loginPromptBtn: "Log In / Register",
            lockedTitle: "TRANSFER MARKET LOCKED",
            lockedDesc: "Lineups are frozen during the Grand Prix. No buys, sells, or Turbo Driver changes are allowed until the market reopens.",
            lockedBadge: "🔴 RACE IN PROGRESS",
            hudBudgetLabel: "REMAINING BUDGET",
            hudTeamValLabel: "TEAM VALUE",
            hudPointsLabel: "FANTASY POINTS",
            hudRankLabel: "LEAGUE RANK",
            hudTurboSub: "Includes Turbo Driver (x2)",
            tabTeam: "My Team",
            tabMarket: "Transfer Market",
            tabLeaderboard: "Fantasy Standings",
            tabRules: "Rules & Scoring",
            teamNameLabel: "Your Team Name:",
            teamNamePlaceholder: "e.g. Apex Factor Racing",
            saveBtn: "Save",
            resetBtn: "Reset Team",
            goToMarketBtn: "+ Sign in Market",
            infoStripText: "<strong>FFC Fantasy Rule:</strong> Your lineup must include exactly 3 drivers and 1 constructor within the €75.0M budget cap. Click the <strong>⭐ Turbo Driver</strong> button on any of your 3 drivers to double (x2) their points in each official Grand Prix.",
            filterAll: "All",
            filterDrivers: "Drivers",
            filterTeams: "Constructors",
            filterRising: "🔥 Rising (▲)",
            filterFalling: "📉 On Offer (▼)",
            filterAffordable: "Affordable (≤ Budget)",
            searchPlaceholder: "Search by name or team...",
            sortPriceDesc: "Price: High to Low",
            sortPriceAsc: "Price: Low to High",
            sortRisingDesc: "Highest Gain (▲ Rise)",
            sortFallingDesc: "Biggest Discount (▼ Bargain)",
            sortPtsDesc: "Points: Most to Least",
            sortNameAsc: "Name: A-Z",
            lbHeading: "FFC Fantasy Overall Standings",
            lbSub: "Team principal rankings and total accumulated points in official Season 1.",
            thPos: "POS",
            thTeam: "TEAM / MANAGER",
            thLineup: "LINEUP (3 DRIVERS + 1 CONSTRUCTOR)",
            thValue: "VALUE",
            thPoints: "POINTS",
            r1Title: "1. Starting Budget (€75.0M)",
            r1Text: "You have a fixed €75.0M budget. Constructors are the primary asset (€14.0M - €38.5M) and drivers range from €6.0M to €29.7M. It is impossible to sign all top drivers and the top team at once, forcing strategic balanced picks.",
            r2Title: "2. Team Structure",
            r2Text: "You must sign exactly <strong>3 official drivers</strong> and <strong>1 constructor</strong>. Duplicate drivers are not allowed in the same lineup.",
            r3Title: "3. Turbo Driver (x2 Multiplier)",
            r3Text: "Select one of your 3 drivers as <strong>Turbo Driver</strong>. Points scored by this driver will be multiplied by 2 (x2) in your team's total score.",
            r4Title: "4. Fresh Start (From Nürburgring)",
            r4Text: "All teams and participants start the Fantasy league with <strong>0 points</strong>. Points will accumulate starting from the Nürburgring Grand Prix (Round 10) and subsequent season rounds based on real points scored by your drivers and constructor in each official race.",
            r5Title: "5. Free Transfer Market",
            r5Text: "You can sell and swap drivers and constructors anytime between races. Selling a driver refunds 100% of their current market value to reinvest in new talent.",
            r6Title: "6. Saved to Your Profile",
            r6Text: "If you are logged in, your team automatically syncs with the Firestore cloud, staying saved and visible in the community leaderboard.",
            r7Title: "7. Dynamic Price Fluctuations & Gains",
            r7Text: "The market price of each driver and constructor rises (<strong>▲ +€0.1M to +€1.0M</strong>) or falls (<strong>▼ -€0.1M to -€0.6M</strong>) after each official Grand Prix based on real performance. If you sign a driver before a breakout performance and their value surges, selling them yields their <strong>new market price</strong>, increasing your overall budget."
        },
        news: {
            kicker: "LATEST • FFC COMMUNITY",
            heading: "NEWS & <span class=\"gold-gradient\">UPDATES</span>",
            description: "Follow official race reports, transfer announcements, driver statements, and community articles. Submit your own news to be published!",
            catAll: "All",
            catRaces: "🏆 Races",
            catTransfers: "🔄 Transfers",
            catDrivers: "🏎️ Drivers",
            catReports: "📝 Reports",
            catCommunity: "👥 Community",
            catTech: "⚙️ Technical",
            searchPlaceholder: "Search news...",
            btnSubmit: "Submit News",
            emptyTitleFiltered: "No news found",
            emptyDescFiltered: "No articles match your current category or search criteria.",
            emptyTitleNoArticles: "No published news yet",
            emptyDescNoArticles: "Be the first to propose an article or write an official league announcement!",
            btnResetFilters: "View all news",
            modalBadge: "PRESS • FFC COMMUNITY",
            modalTitle: "✍️ SUBMIT COMMUNITY NEWS",
            modalSubtitle: "Share a race report, technical analysis, team press release, or article. Once reviewed and approved by administrators, it will be published on the official site.",
            labelTitle: 'Article Title <span class="required-star">*</span>',
            placeholderTitle: "e.g. Spectacular comeback by Dieguiosk at Monza in the rain",
            labelCategory: 'Category <span class="required-star">*</span>',
            catOptionRaces: "🏆 Races",
            catOptionTransfers: "🔄 Transfers",
            catOptionDrivers: "🏎️ Drivers",
            catOptionReports: "📝 Reports",
            catOptionCommunity: "👥 Community",
            catOptionTech: "⚙️ Technical Analysis",
            labelAuthor: 'Author (Your Account) <span class="required-star">*</span>',
            placeholderAuthor: "Your registered username",
            labelSummary: "Short Summary (1-2 sentences)",
            placeholderSummary: "A brief description that will appear on the article card (optional)",
            labelImage: "Cover Image URL (Optional)",
            btnPresetImg: "FFC Background",
            hintImage: "If left empty, an official Formula Factor background will be automatically assigned.",
            labelContent: 'Full Article Content <span class="required-star">*</span>',
            placeholderContent: "Write your race report, statements, feelings, or full article here...",
            hintContent: "You can separate your thoughts into paragraphs. Line breaks will be preserved when published.",
            moderationNotice: "<strong>Moderation Notice:</strong> All news undergoes a review process by administrators before becoming publicly visible to ensure quality and respect in the league.",
            btnCancel: "Cancel",
            btnSubmitAction: "<span>🚀</span> Submit for Review",
            btnEditArticle: "✏️ Edit Article",
            shareBtn: "🔗 Copy link",
            commentsHeading: "💬 COMMUNITY COMMENTS",
            commentAuthorPlaceholder: "Your name / alias",
            commentTextPlaceholder: "Write a comment on this news...",
            commentSubmitBtn: "<span>💬</span> Post Comment",
            noComments: "No comments yet. Be the first to comment on this news article!",
            officialBadge: "OFFICIAL FFC",
            compare: {
                title: "⚔️ DRIVER COMPARATOR",
                sub: "Face-to-face analysis: direct track duel, points, wins, pace & reliability",
                presets: "RECOMMENDED DUELS:",
                driverA: "DRIVER A (RED CORNER)",
                driverB: "DRIVER B (BLUE CORNER)",
                swapTitle: "Swap drivers",
                modeMutual: "MATCHING RACES ONLY (FAIR)",
                modeMutualTitle: "Only evaluates Grands Prix where both drivers started",
                modeAll: "FULL SEASON (15 GPS)",
                modeAllTitle: "Evaluates all 15 rounds of the full season calendar",
                modeInfoMutual: "Fair Mode active: Only races where both competed on track are analyzed. Absences do not award wins to the rival.",
                modeInfoAll: "Full Season Mode active: Evaluates all rounds on the calendar (15 GPs). Absences count as a win for the present driver.",
                h2hVerdict: "DIRECT ON-TRACK DUEL",
                h2hSub: "Races finished ahead",
                metricsTitle: "DETAILED STATISTICAL COMPARISON",
                metricsSub: "OFFICIAL FFC SEASON 2010",
                skillsTitle: "PERFORMANCE & SKILLS INDEX",
                skillsSub: "NORMALIZED DRIVING METRICS",
                roundsTitle: "ROUND-BY-ROUND DUELS (R1 - R15)",
                roundsSub: "DIRECT RESULTS IN EACH GRAND PRIX",
                thRound: "ROUND",
                thGp: "GRAND PRIX",
                thDuel: "GP DUEL",
                thDiff: "PTS DIFF",
                tie: "Tie",
                noMatch: "No match",
                noMatchTitle: "Only one participated: no win awarded in Fair Mode",
                didNotParticipate: "DID NOT START",
                metrics: {
                    avgPts: "AVG PTS / GP",
                    mutualPts: "POINTS IN DIRECT DUELS",
                    podiumEff: "PODIUM EFFICIENCY",
                    winEff: "WIN EFFICIENCY",
                    racesEntered: "RACES ENTERED",
                    totalPts: "TOTAL POINTS",
                    champPos: "CHAMPIONSHIP POSITION",
                    poles: "POLE POSITIONS",
                    fastestLaps: "FASTEST LAPS",
                    reliability: "RACE RELIABILITY",
                    fantasyValue: "FFC FANTASY VALUE"
                },
                skills: {
                    racePace: "🏎️ RACE PACE",
                    qualyPace: "⏱️ QUALY PACE",
                    reliability: "🛡️ MECHANICAL RELIABILITY",
                    consistency: "🎯 TOP 10 CONSISTENCY",
                    podiumEff: "🏆 PODIUM EFFICIENCY"
                }
            }
        }
    }
};

let currentLanguage = "es";
let compareMode = "mutual"; // "mutual" (Fair H2H - only shared races) or "all" (Full season)

function updateCalendarCards(lang) {
    const cards = document.querySelectorAll(".calendar-card");
    const dict = translations[lang] ? translations[lang].calendar : null;
    if (!dict) return;

    cards.forEach(card => {
        const statusEl = card.querySelector(".calendar-status");
        if (statusEl) {
            if (!card.dataset.origStatus) {
                card.dataset.origStatus = statusEl.textContent.trim().toUpperCase();
            }
            const orig = card.dataset.origStatus;
            statusEl.textContent = dict.statusMap[orig] || orig;
        }

        const hintEl = card.querySelector(".click-hint");
        if (hintEl) {
            hintEl.textContent = dict.viewResults;
        }

        const cardReplayBtn = card.querySelector(".card-replay-btn");
        if (cardReplayBtn) {
            cardReplayBtn.title = lang === "en" ? "Watch race replay" : "Ver repetición de la carrera";
        }

        const actionNoteEl = card.querySelector(".calendar-action-note");
        if (actionNoteEl && dict.thisWeekend) {
            actionNoteEl.textContent = dict.thisWeekend;
        }

        const countryEl = card.querySelector("p");
        if (countryEl) {
            if (!card.dataset.origCountry) {
                card.dataset.origCountry = countryEl.textContent.trim().toUpperCase();
            }
            const origC = card.dataset.origCountry;
            countryEl.textContent = dict.countries[origC] || origC;
        }
    });
}

function applyTranslations(lang) {
    const dict = translations[lang];
    if (!dict) return;

    // Navigation
    const navH = document.getElementById("navHome");
    if (navH) navH.textContent = dict.nav.home;
    const navS = document.getElementById("navStandings");
    if (navS) navS.textContent = dict.nav.standings;
    const navC = document.getElementById("navCalendar");
    if (navC) navC.textContent = dict.nav.calendar;
    const navR = document.getElementById("navRaces");
    if (navR) navR.textContent = dict.nav.races;
    const navN = document.getElementById("navNews");
    if (navN && dict.nav && dict.nav.news) navN.textContent = dict.nav.news;
    const navI = document.getElementById("navInfo");
    if (navI) navI.textContent = dict.nav.info;
    const navCmp = document.getElementById("navCompareText");
    if (navCmp && dict.nav && dict.nav.compare) navCmp.textContent = dict.nav.compare;
    const navF = document.getElementById("navFantasyText");
    if (navF && dict.nav && dict.nav.fantasy) navF.textContent = dict.nav.fantasy;

    // Hero
    const heroEye = document.getElementById("heroEyebrow");
    if (heroEye) heroEye.textContent = dict.hero.eyebrow;
    const heroT = document.getElementById("heroTitle");
    if (heroT) heroT.innerHTML = dict.hero.title;
    const heroTagGps = document.getElementById("heroTagGpsText");
    if (heroTagGps && dict.hero.tagGps) heroTagGps.textContent = dict.hero.tagGps;
    const heroTagDrivers = document.getElementById("heroTagDriversText");
    if (heroTagDrivers && dict.hero.tagDrivers) heroTagDrivers.textContent = dict.hero.tagDrivers;
    const heroTagChampion = document.getElementById("heroTagChampionText");
    if (heroTagChampion && dict.hero.tagChampion) heroTagChampion.textContent = dict.hero.tagChampion;
    const heroD = document.getElementById("heroDescription");
    if (heroD) heroD.textContent = dict.hero.description;
    const heroBS = document.getElementById("heroBtnStandings");
    if (heroBS) heroBS.textContent = dict.hero.btnStandings;
    const heroBC = document.getElementById("heroBtnCalendar");
    if (heroBC) heroBC.textContent = dict.hero.btnCalendar;

    // Live Stream Hero & Next Race Live Chat
    if (dict.live) {
        const liveBadge = document.getElementById("liveStatusBadge");
        if (liveBadge) liveBadge.textContent = dict.live.badge;
        const twitchBtnLabel = document.getElementById("twitchBtnLabel");
        if (twitchBtnLabel) twitchBtnLabel.textContent = dict.live.watchOnTwitch;
        const heroLiveBtnStandings = document.getElementById("heroLiveBtnStandings");
        if (heroLiveBtnStandings) heroLiveBtnStandings.textContent = dict.live.btnStandings;
        const heroLiveBtnCalendar = document.getElementById("heroLiveBtnCalendar");
        if (heroLiveBtnCalendar) heroLiveBtnCalendar.textContent = dict.live.btnCalendar;

        const liveChatBadge = document.getElementById("liveChatBadgeText");
        if (liveChatBadge && dict.live.chatBadge) liveChatBadge.textContent = dict.live.chatBadge;
        const liveChatSuffix = document.getElementById("liveChatSuffixText");
        if (liveChatSuffix && dict.live.chatSuffix) liveChatSuffix.textContent = dict.live.chatSuffix;
        const twitchChatPopout = document.getElementById("twitchChatPopoutText");
        if (twitchChatPopout && dict.live.chatPopout) twitchChatPopout.textContent = dict.live.chatPopout;
    }

    // Next race card
    const nrcTop = document.getElementById("nextRaceCardTopText");
    if (nrcTop) nrcTop.textContent = dict.nextRace.cardTop;
    const nrcNext = document.getElementById("nextRaceNextLabel");
    if (nrcNext) nrcNext.textContent = dict.nextRace.nextLabel;
    const lblD = document.getElementById("labelDays");
    if (lblD) lblD.textContent = dict.nextRace.days;
    const lblH = document.getElementById("labelHours");
    if (lblH) lblH.textContent = dict.nextRace.hours;
    const lblM = document.getElementById("labelMins");
    if (lblM) lblM.textContent = dict.nextRace.mins;
    const lblS = document.getElementById("labelSecs");
    if (lblS) lblS.textContent = dict.nextRace.secs;
    const rstLabel = document.getElementById("raceStartTimeLabel");
    if (rstLabel && dict.nextRace.raceStartTime) rstLabel.textContent = dict.nextRace.raceStartTime;
    const nrdBtnText = document.getElementById("nextRaceDetailsBtnText");
    if (nrdBtnText && dict.nextRace.circuitDetails) nrdBtnText.textContent = dict.nextRace.circuitDetails;

    // Stats
    const stSeason = document.getElementById("statLabelSeason");
    if (stSeason) stSeason.textContent = dict.stats.season;
    const stRounds = document.getElementById("statLabelRounds");
    if (stRounds) stRounds.textContent = dict.stats.rounds;
    const stRacing = document.getElementById("statLabelRacing");
    if (stRacing) stRacing.textContent = dict.stats.racing;
    const stDrivers = document.getElementById("statLabelDrivers");
    if (stDrivers) stDrivers.textContent = dict.stats.drivers;

    // Standings section
    const stKicker = document.getElementById("standingsKicker");
    if (stKicker) stKicker.textContent = dict.standings.kicker;
    const stHeading = document.getElementById("standingsHeading");
    if (stHeading) stHeading.textContent = dict.standings.heading;
    const stSub = document.getElementById("standingsSub");
    if (stSub) stSub.textContent = dict.standings.sub;
    const drvTitle = document.getElementById("driverChampionshipTitle");
    if (drvTitle) drvTitle.textContent = dict.standings.driverTitle;
    const drvRound = document.getElementById("driverChampionshipRound");
    if (drvRound) drvRound.textContent = dict.standings.driverRoundPrefix;
    const drvPtsHdr = document.getElementById("driverPointsHeader");
    if (drvPtsHdr) drvPtsHdr.textContent = dict.standings.pointsHeader;
    const thDPos = document.getElementById("thDriverPos");
    if (thDPos) thDPos.textContent = dict.standings.thPos;
    const thDName = document.getElementById("thDriverName");
    if (thDName) thDName.textContent = dict.standings.thDriver;
    const thDTeam = document.getElementById("thDriverTeam");
    if (thDTeam) thDTeam.textContent = dict.standings.thTeam;
    const thDPts = document.getElementById("thDriverPts");
    if (thDPts) thDPts.textContent = dict.standings.thPts;

    // Constructor Standings
    const tmTitle = document.getElementById("teamChampionshipTitle");
    if (tmTitle) tmTitle.textContent = dict.standings.teamTitle;
    const tmRound = document.getElementById("teamChampionshipRound");
    if (tmRound) tmRound.textContent = dict.standings.teamRoundPrefix;
    const tmPtsHdr = document.getElementById("teamPointsHeader");
    if (tmPtsHdr) tmPtsHdr.textContent = dict.standings.teamPointsHeader;
    const thTPos = document.getElementById("thTeamPos");
    if (thTPos) thTPos.textContent = dict.standings.thTeamPos;
    const thTName = document.getElementById("thTeamName");
    if (thTName) thTName.textContent = dict.standings.thTeamName;
    const thTPts = document.getElementById("thTeamPoints");
    if (thTPts) thTPts.textContent = dict.standings.thTeamPoints;
    const thTDiff = document.getElementById("thTeamDiff");
    if (thTDiff) thTDiff.textContent = dict.standings.thTeamDiff;

    // Calendar section
    const calK = document.getElementById("calendarKicker");
    if (calK) calK.textContent = dict.calendar.kicker;
    const calH = document.getElementById("calendarHeading");
    if (calH) calH.textContent = dict.calendar.heading;
    const calS = document.getElementById("calendarSub");
    if (calS) calS.textContent = dict.calendar.sub;

    // Races section
    const rcK = document.getElementById("racesKicker");
    if (rcK) rcK.textContent = dict.races.kicker;
    const rcH = document.getElementById("racesHeading");
    if (rcH) rcH.textContent = dict.races.heading;
    const rcS = document.getElementById("racesSub");
    if (rcS) rcS.textContent = dict.races.sub;
    const rcRound = document.getElementById("raceFeatureRoundPrefix");
    if (rcRound) rcRound.textContent = dict.races.round;
    const rcNext = document.getElementById("raceFeatureNextEvent");
    if (rcNext) rcNext.textContent = dict.races.nextEvent;

    // Info section
    const inH = document.getElementById("infoHeading");
    if (inH) inH.textContent = dict.info.heading;
    const in1 = document.getElementById("infoP1");
    if (in1) in1.textContent = dict.info.p1;
    const in2 = document.getElementById("infoP2");
    if (in2) in2.textContent = dict.info.p2;
    const in3 = document.getElementById("infoP3");
    if (in3) in3.textContent = dict.info.p3;

    const infoCardTitle1 = document.getElementById("infoCardTitle1");
    if (infoCardTitle1) infoCardTitle1.textContent = dict.info.card1Title;
    const infoCardDesc1 = document.getElementById("infoCardDesc1");
    if (infoCardDesc1) infoCardDesc1.textContent = dict.info.card1Desc;

    const infoCardTitle2 = document.getElementById("infoCardTitle2");
    if (infoCardTitle2) infoCardTitle2.textContent = dict.info.card2Title;
    const infoCardDesc2 = document.getElementById("infoCardDesc2");
    if (infoCardDesc2) infoCardDesc2.textContent = dict.info.card2Desc;

    const infoCardTitle3 = document.getElementById("infoCardTitle3");
    if (infoCardTitle3) infoCardTitle3.textContent = dict.info.card3Title;
    const infoCardDesc3 = document.getElementById("infoCardDesc3");
    if (infoCardDesc3) infoCardDesc3.textContent = dict.info.card3Desc;

    const infoCardTitle4 = document.getElementById("infoCardTitle4");
    if (infoCardTitle4) infoCardTitle4.textContent = dict.info.card4Title;
    const infoCardDesc4 = document.getElementById("infoCardDesc4");
    if (infoCardDesc4) infoCardDesc4.textContent = dict.info.card4Desc;

    const infoDisclaimerText = document.getElementById("infoDisclaimerText");
    if (infoDisclaimerText && dict.info.disclaimerHtml) infoDisclaimerText.innerHTML = dict.info.disclaimerHtml;

    const inSoc = document.getElementById("socialsKicker");
    if (inSoc) inSoc.textContent = dict.info.socialsKicker;

    // Modal
    const clBtn = document.getElementById("closeRace");
    if (clBtn) clBtn.setAttribute("aria-label", dict.modal.closeLabel);
    const winL = document.getElementById("labelWinner");
    if (winL) winL.textContent = dict.modal.winner;
    const polL = document.getElementById("labelPole");
    if (polL) polL.textContent = dict.modal.pole;
    const fasL = document.getElementById("labelFastest");
    if (fasL) fasL.textContent = dict.modal.fastest;
    const dodL = document.getElementById("labelDriverDay");
    if (dodL) dodL.textContent = dict.modal.driverDay;
    const rsT = document.getElementById("resultSectionTitle");
    if (rsT) rsT.textContent = dict.modal.resultTitle;
    const rsS = document.getElementById("resultSectionSub");
    if (rsS) rsS.textContent = dict.modal.resultSub;
    const thRPos = document.getElementById("thResultPos");
    if (thRPos) thRPos.textContent = dict.modal.thPos;
    const thRDrv = document.getElementById("thResultDriver");
    if (thRDrv) thRDrv.textContent = dict.modal.thDriver;
    const thRTm = document.getElementById("thResultTeam");
    if (thRTm) thRTm.textContent = dict.modal.thTeam;
    const thRSt = document.getElementById("thResultStatus");
    if (thRSt) thRSt.textContent = dict.modal.thStatus;
    const bkBtn = document.getElementById("backToCalendar");
    if (bkBtn) bkBtn.textContent = dict.modal.backBtn;

    // Timezone & Language settings in User Profile
    const profileTzLabel = document.getElementById("profileTzLabel");
    if (profileTzLabel) {
        profileTzLabel.textContent = lang === "en" ? "⏰ Time Zone" : "⏰ Zona Horaria";
    }
    const profileLangLabel = document.getElementById("profileLangLabel");
    if (profileLangLabel) {
        profileLangLabel.textContent = lang === "en" ? "🌐 Language" : "🌐 Idioma / Language";
    }
    renderTimezoneOptions();

    // User Auth translations
    if (dict.auth) {
        const authBtnLabelEl = document.getElementById("authBtnLabel");
        if (authBtnLabelEl && !authBtnLabelEl.dataset.customName) {
            authBtnLabelEl.textContent = dict.auth.btnLabel;
        }
        const authBadgeEl = document.getElementById("authBadge");
        if (authBadgeEl) authBadgeEl.textContent = dict.auth.badge;
        const tabLog = document.getElementById("authTabLogin");
        if (tabLog) tabLog.textContent = dict.auth.tabLogin;
        const tabReg = document.getElementById("authTabRegister");
        if (tabReg) tabReg.textContent = dict.auth.tabRegister;

        const logSub = document.getElementById("loginSubtitle");
        if (logSub) logSub.textContent = dict.auth.loginSub;
        const regSub = document.getElementById("registerSubtitle");
        if (regSub) regSub.textContent = dict.auth.registerSub;
        const resSub = document.getElementById("resetSubtitle");
        if (resSub) resSub.textContent = dict.auth.resetSub;

        // Labels
        const lblLogEmail = document.getElementById("labelLoginEmail");
        if (lblLogEmail) lblLogEmail.textContent = dict.auth.labelEmail;
        const lblLogPassword = document.getElementById("labelLoginPassword");
        if (lblLogPassword) lblLogPassword.textContent = dict.auth.labelPassword;
        const lblRegName = document.getElementById("labelRegisterName");
        if (lblRegName) lblRegName.textContent = dict.auth.labelName;
        const lblRegEmail = document.getElementById("labelRegisterEmail");
        if (lblRegEmail) lblRegEmail.textContent = dict.auth.labelEmail;
        const lblRegPassword = document.getElementById("labelRegisterPassword");
        if (lblRegPassword) lblRegPassword.textContent = dict.auth.labelPasswordReg;
        const lblResEmail = document.getElementById("labelResetEmail");
        if (lblResEmail) lblResEmail.textContent = dict.auth.labelEmail;

        // Input placeholders
        const inputLogEmail = document.getElementById("loginEmailInput");
        if (inputLogEmail) inputLogEmail.placeholder = lang === "en" ? "driver@formulafactor.com" : "piloto@formulafactor.com";
        const inputRegName = document.getElementById("registerNameInput");
        if (inputRegName) inputRegName.placeholder = lang === "en" ? "e.g. Ayrton, Max, Dieguiosk..." : "Ej. Ayrton, Max, Dieguiosk...";
        const inputRegEmail = document.getElementById("registerEmailInput");
        if (inputRegEmail) inputRegEmail.placeholder = lang === "en" ? "driver@formulafactor.com" : "piloto@formulafactor.com";
        const inputResEmail = document.getElementById("resetEmailInput");
        if (inputResEmail) inputResEmail.placeholder = lang === "en" ? "driver@formulafactor.com" : "piloto@formulafactor.com";

        const forgotLink = document.getElementById("authForgotBtn");
        if (forgotLink) forgotLink.textContent = dict.auth.forgotLink;
        const logCancel = document.getElementById("loginCancelBtn");
        if (logCancel) logCancel.textContent = dict.auth.btnCancel;
        const regCancel = document.getElementById("registerCancelBtn");
        if (regCancel) regCancel.textContent = dict.auth.btnCancel;
        const resBack = document.getElementById("resetBackBtn");
        if (resBack) resBack.textContent = dict.auth.btnBack;

        const logSubText = document.getElementById("loginSubmitBtnText");
        if (logSubText) logSubText.textContent = dict.auth.btnSubmitLogin;
        const regSubText = document.getElementById("registerSubmitBtnText");
        if (regSubText) regSubText.textContent = dict.auth.btnSubmitRegister;
        const resSubText = document.getElementById("resetSubmitBtnText");
        if (resSubText) resSubText.textContent = dict.auth.btnSubmitReset;

        const uLogout = document.getElementById("userLogoutBtn");
        if (uLogout) {
            const logoutSpan = uLogout.querySelector("span:last-child");
            if (logoutSpan) logoutSpan.textContent = dict.auth.btnLogout;
        }
        const uAdminBtn = document.getElementById("userAdminBtnText");
        if (uAdminBtn && dict.auth && dict.auth.adminPanelBtn) uAdminBtn.textContent = dict.auth.adminPanelBtn;
        const uFantasyBtn = document.getElementById("userFantasyBtnText");
        if (uFantasyBtn) uFantasyBtn.textContent = lang === "en" ? "My FFC Fantasy Team" : "Mi Escudería FFC Fantasy";

        if (typeof activeUserAuth !== "undefined" && activeUserAuth) {
            renderUserAuthState(activeUserAuth);
        }
    }

    // Driver Claim / Verification Card translations
    if (dict.claim) {
        const cTitle = document.getElementById("claimNoticeTitle");
        if (cTitle) cTitle.textContent = dict.claim.title;

        const cDesc = document.getElementById("claimNoticeDesc");
        if (cDesc) cDesc.innerHTML = dict.claim.desc;

        const cBtn = document.getElementById("claimDiscordTicketBtnText");
        if (cBtn) cBtn.textContent = dict.claim.ticketBtn;

        const cStep = document.getElementById("claimStepLabel");
        if (cStep) cStep.textContent = dict.claim.stepLabel;

        const cCode = document.getElementById("userClaimCodeInput");
        if (cCode) cCode.placeholder = dict.claim.codePlaceholder;

        const cSubmit = document.getElementById("userClaimSubmitBtn");
        if (cSubmit) cSubmit.textContent = dict.claim.submitBtn;

        const cTag = document.getElementById("verifiedTagText");
        if (cTag) cTag.textContent = dict.claim.verifiedTag;

        const cUnlink = document.getElementById("userUnlinkDriverBtn");
        if (cUnlink) {
            const span = cUnlink.querySelector("span");
            if (span) span.textContent = dict.claim.unlinkBtn;
        }

        const cCust = document.getElementById("openCardCustomizerPopupBtn");
        if (cCust) cCust.textContent = dict.claim.customizeBtn;

        const cView = document.getElementById("openMyDriverCardBtn");
        if (cView) cView.textContent = dict.claim.viewCardBtn;
    }

    // Driver Card Editor Modal translations
    if (dict.cardEditor) {
        const ceTitle = document.getElementById("cardEditorTitle");
        if (ceTitle) ceTitle.textContent = dict.cardEditor.title;
        const ceDesc = document.getElementById("cardEditorDesc");
        if (ceDesc) ceDesc.textContent = dict.cardEditor.desc;
        const cePrevLabel = document.getElementById("cardEditorPreviewLabel");
        if (cePrevLabel) cePrevLabel.textContent = dict.cardEditor.previewLabel;
        const ceLiveBadge = document.getElementById("cardEditorLiveBadge");
        if (ceLiveBadge) ceLiveBadge.textContent = dict.cardEditor.liveBadge;
        const ceG1 = document.getElementById("cardGroup1Title");
        if (ceG1) ceG1.textContent = dict.cardEditor.group1;
        const ceCustColor = document.getElementById("cardCustomColorLabel");
        if (ceCustColor) ceCustColor.textContent = dict.cardEditor.customColorLabel;
        const ceG2 = document.getElementById("cardGroup2Title");
        if (ceG2) ceG2.textContent = dict.cardEditor.group2;
        const ceAvLabel = document.getElementById("avatarPresetLabel");
        if (ceAvLabel) ceAvLabel.textContent = dict.cardEditor.avatarPresetLabel;
        const ceRemAv = document.getElementById("btnRemoveAvatar");
        if (ceRemAv) ceRemAv.title = lang === "en" ? "Remove photo" : "Quitar foto";
        const ceTrigFile = document.getElementById("btnTriggerAvatarFileSpan");
        if (ceTrigFile) ceTrigFile.textContent = dict.cardEditor.btnTriggerAvatarFile;
        const ceOrText = document.getElementById("avatarUploadOrText");
        if (ceOrText) ceOrText.textContent = dict.cardEditor.avatarUploadOr;
        const ceG3 = document.getElementById("cardGroup3Title");
        if (ceG3) ceG3.textContent = dict.cardEditor.group3;
        const ceLocked = document.getElementById("cardLockedBadge");
        if (ceLocked) ceLocked.textContent = dict.cardEditor.lockedBadge;
        const ceNotice = document.getElementById("officialFlagNotice");
        if (ceNotice) ceNotice.textContent = dict.cardEditor.officialFlagNotice;
        const ceG4 = document.getElementById("cardGroup4Title");
        if (ceG4) ceG4.textContent = dict.cardEditor.group4;
        const ceBioSuggest = document.getElementById("bioSuggestLabel");
        if (ceBioSuggest) ceBioSuggest.textContent = dict.cardEditor.bioSuggestLabel;
        const ceBio = document.getElementById("editCardBio");
        if (ceBio) ceBio.placeholder = dict.cardEditor.bioPlaceholder;
        const ceG5 = document.getElementById("cardGroup5Title");
        if (ceG5) ceG5.textContent = dict.cardEditor.group5;
        const ceSave = document.getElementById("saveDriverCardBtn");
        if (ceSave) ceSave.textContent = dict.cardEditor.saveBtn;
        const ceView = document.getElementById("modalViewOfficialCardBtn");
        if (ceView) ceView.textContent = dict.cardEditor.viewBtn;
    }

    // Fantasy section translations
    if (dict.fantasy) {
        const fBack = document.getElementById("fantasyBackBtnText");
        if (fBack) fBack.textContent = dict.fantasy.backBtn;

        const fLive = document.getElementById("fantasyStatusLive");
        if (fLive) fLive.textContent = dict.fantasy.statusLive;

        const fBadge = document.getElementById("fantasySeasonBadge");
        if (fBadge) fBadge.textContent = dict.fantasy.seasonBadge;

        const fEyebrow = document.getElementById("fantasyHeroEyebrow");
        if (fEyebrow) fEyebrow.innerHTML = `<span>🏆</span> ${dict.fantasy.heroEyebrow}`;

        const fTitle = document.getElementById("fantasyHeroTitle");
        if (fTitle) fTitle.innerHTML = dict.fantasy.heroTitle;

        const fDesc = document.getElementById("fantasyHeroDesc");
        if (fDesc) fDesc.textContent = dict.fantasy.heroDesc;

        const fAuthT = document.getElementById("fantasyAuthBannerTitle");
        if (fAuthT) fAuthT.textContent = dict.fantasy.authTitle;

        const fAuthD = document.getElementById("fantasyAuthBannerDesc");
        if (fAuthD) fAuthD.textContent = dict.fantasy.authDesc;

        const fLoginPromptText = document.getElementById("fantasyLoginPromptText");
        if (fLoginPromptText) fLoginPromptText.textContent = dict.fantasy.loginPromptBtn;

        const fLockT = document.getElementById("fantasyLockedTitle");
        if (fLockT) fLockT.textContent = dict.fantasy.lockedTitle;

        const fLockD = document.getElementById("fantasyLockedDesc");
        if (fLockD) fLockD.textContent = dict.fantasy.lockedDesc;

        const fLockB = document.getElementById("fantasyLockedBadgeText");
        if (fLockB) fLockB.textContent = dict.fantasy.lockedBadge;

        const hudBudgetL = document.getElementById("hudBudgetLabel");
        if (hudBudgetL) hudBudgetL.textContent = dict.fantasy.hudBudgetLabel;

        const hudTeamValL = document.getElementById("hudTeamValLabel");
        if (hudTeamValL) hudTeamValL.textContent = dict.fantasy.hudTeamValLabel;

        const hudPointsL = document.getElementById("hudPointsLabel");
        if (hudPointsL) hudPointsL.textContent = dict.fantasy.hudPointsLabel;

        const hudRankL = document.getElementById("hudRankLabel");
        if (hudRankL) hudRankL.textContent = dict.fantasy.hudRankLabel;

        const hudTurboS = document.getElementById("hudTurboSub");
        if (hudTurboS) hudTurboS.textContent = dict.fantasy.hudTurboSub;

        const tTeam = document.getElementById("tabLabelTeam");
        if (tTeam) tTeam.textContent = dict.fantasy.tabTeam;

        const tMarket = document.getElementById("tabLabelMarket");
        if (tMarket) tMarket.textContent = dict.fantasy.tabMarket;

        const tLb = document.getElementById("tabLabelLeaderboard");
        if (tLb) tLb.textContent = dict.fantasy.tabLeaderboard;

        const tRules = document.getElementById("tabLabelRules");
        if (tRules) tRules.textContent = dict.fantasy.tabRules;

        const teamNameL = document.getElementById("teamNameLabel");
        if (teamNameL) teamNameL.textContent = dict.fantasy.teamNameLabel;

        const saveBtnT = document.getElementById("saveTeamNameBtnText");
        if (saveBtnT) saveBtnT.textContent = dict.fantasy.saveBtn;

        const resetBtnT = document.getElementById("fantasyResetBtnText");
        if (resetBtnT) resetBtnT.textContent = dict.fantasy.resetBtn;

        const goToMarketT = document.getElementById("fantasyGoToMarketText");
        if (goToMarketT) goToMarketT.textContent = dict.fantasy.goToMarketBtn;

        const infoStripT = document.getElementById("fantasyInfoStripText");
        if (infoStripT) infoStripT.innerHTML = dict.fantasy.infoStripText;

        // Filter pills
        const fAll = document.getElementById("marketFilterAll");
        if (fAll) fAll.textContent = dict.fantasy.filterAll;
        const fDrv = document.getElementById("marketFilterDrivers");
        if (fDrv) fDrv.textContent = dict.fantasy.filterDrivers;
        const fTm = document.getElementById("marketFilterTeams");
        if (fTm) fTm.textContent = dict.fantasy.filterTeams;
        const fRis = document.getElementById("marketFilterRising");
        if (fRis) fRis.textContent = dict.fantasy.filterRising;
        const fFal = document.getElementById("marketFilterFalling");
        if (fFal) fFal.textContent = dict.fantasy.filterFalling;
        const fAff = document.getElementById("marketFilterAffordable");
        if (fAff) fAff.textContent = dict.fantasy.filterAffordable;

        // Search & Sort
        const mSearch = document.getElementById("marketSearchInput");
        if (mSearch) mSearch.placeholder = dict.fantasy.searchPlaceholder;

        const mSort = document.getElementById("marketSortSelect");
        if (mSort) {
            const opts = mSort.options;
            if (opts && opts.length >= 6) {
                opts[0].textContent = dict.fantasy.sortPriceDesc;
                opts[1].textContent = dict.fantasy.sortPriceAsc;
                opts[2].textContent = dict.fantasy.sortRisingDesc;
                opts[3].textContent = dict.fantasy.sortFallingDesc;
                opts[4].textContent = dict.fantasy.sortPtsDesc;
                opts[5].textContent = dict.fantasy.sortNameAsc;
            }
        }

        // Leaderboard
        const lbH = document.getElementById("fantasyLeaderboardHeading");
        if (lbH) lbH.textContent = dict.fantasy.lbHeading;
        const lbS = document.getElementById("fantasyLeaderboardSub");
        if (lbS) lbS.textContent = dict.fantasy.lbSub;

        const thPos = document.getElementById("thLbPos");
        if (thPos) thPos.textContent = dict.fantasy.thPos;
        const thTeam = document.getElementById("thLbTeam");
        if (thTeam) thTeam.textContent = dict.fantasy.thTeam;
        const thLineup = document.getElementById("thLbLineup");
        if (thLineup) thLineup.textContent = dict.fantasy.thLineup;
        const thVal = document.getElementById("thLbVal");
        if (thVal) thVal.textContent = dict.fantasy.thValue;
        const thPts = document.getElementById("thLbPts");
        if (thPts) thPts.textContent = dict.fantasy.thPoints;

        // Rules
        for (let i = 1; i <= 7; i++) {
            const rT = document.getElementById(`ruleCard${i}Title`);
            const rTxt = document.getElementById(`ruleCard${i}Text`);
            if (rT && dict.fantasy[`r${i}Title`]) rT.textContent = dict.fantasy[`r${i}Title`];
            if (rTxt && dict.fantasy[`r${i}Text`]) rTxt.innerHTML = dict.fantasy[`r${i}Text`];
        }

        if (typeof renderFantasyPortal === "function" && typeof isFantasyModuleInitialized !== "undefined" && isFantasyModuleInitialized) {
            renderFantasyPortal();
        }
    }

    // News section translations
    if (dict.news) {
        const newsKicker = document.getElementById("newsKicker");
        if (newsKicker) newsKicker.textContent = dict.news.kicker;
        const newsHeading = document.getElementById("newsHeading");
        if (newsHeading) newsHeading.innerHTML = dict.news.heading;
        const newsDesc = document.getElementById("newsDescription");
        if (newsDesc) newsDesc.textContent = dict.news.description;

        const catAll = document.getElementById("newsCatBtnAll");
        if (catAll) catAll.textContent = dict.news.catAll;
        const catRaces = document.getElementById("newsCatBtnRaces");
        if (catRaces) catRaces.textContent = dict.news.catRaces;
        const catTransfers = document.getElementById("newsCatBtnTransfers");
        if (catTransfers) catTransfers.textContent = dict.news.catTransfers;
        const catDrivers = document.getElementById("newsCatBtnDrivers");
        if (catDrivers) catDrivers.textContent = dict.news.catDrivers;
        const catReports = document.getElementById("newsCatBtnReports");
        if (catReports) catReports.textContent = dict.news.catReports;
        const catCommunity = document.getElementById("newsCatBtnCommunity");
        if (catCommunity) catCommunity.textContent = dict.news.catCommunity;
        const catTech = document.getElementById("newsCatBtnTech");
        if (catTech) catTech.textContent = dict.news.catTech;

        const newsSearchInput = document.getElementById("newsSearchInput");
        if (newsSearchInput) {
            newsSearchInput.placeholder = dict.news.searchPlaceholder;
            newsSearchInput.setAttribute("aria-label", dict.news.searchPlaceholder);
        }
        const btnSubmitNewsText = document.getElementById("btnSubmitNewsText");
        if (btnSubmitNewsText) btnSubmitNewsText.textContent = dict.news.btnSubmit;

        const btnResetNewsFilters = document.getElementById("btnResetNewsFilters");
        if (btnResetNewsFilters) btnResetNewsFilters.textContent = dict.news.btnResetFilters;

        // Submit News Modal / Word-Style Editor (Bilingual)
        const newsSubmitModalBadge = document.getElementById("newsSubmitModalBadge");
        if (newsSubmitModalBadge && !window.ffcEditingArticleId) newsSubmitModalBadge.textContent = lang === "en" ? "PRESS • FFC REDACTION" : "PRENSA • REDACCIÓN FFC";
        const newsSubmitModalTitle = document.getElementById("newsSubmitModalTitle");
        if (newsSubmitModalTitle && !window.ffcEditingArticleId) newsSubmitModalTitle.textContent = lang === "en" ? "✍️ ARTICLE EDITOR (BILINGUAL)" : "✍️ REDACTOR DE ARTÍCULO (BILINGÜE)";

        const newsBilingualSubtext = document.getElementById("newsBilingualSubtext");
        if (newsBilingualSubtext) newsBilingualSubtext.textContent = lang === "en" ? "You must write the article in both Spanish and English for the international community" : "Debes redactar la noticia en Español e Inglés para la comunidad internacional";

        const dropzoneTitleText = document.getElementById("dropzoneTitleText");
        if (dropzoneTitleText) dropzoneTitleText.textContent = lang === "en" ? "Click to upload cover photo or drag & drop here" : "Haz clic para subir una foto o arrástrala aquí";
        const dropzoneHintText = document.getElementById("dropzoneHintText");
        if (dropzoneHintText) dropzoneHintText.textContent = lang === "en" ? "Upload JPG, PNG or WebP from PC/mobile (auto-compressed and optimized)" : "Sube JPG, PNG o WebP desde tu ordenador o móvil (se ajusta y optimiza automáticamente)";
        const btnDropzoneBrowse = document.getElementById("btnDropzoneBrowse");
        if (btnDropzoneBrowse) btnDropzoneBrowse.textContent = lang === "en" ? "Upload Photo" : "Subir Foto";
        const btnToggleUrlInput = document.getElementById("btnToggleUrlInput");
        if (btnToggleUrlInput) btnToggleUrlInput.textContent = lang === "en" ? "🔗 Or paste image web link" : "🔗 O pegar enlace web de imagen";
        const btnNewsUseDefaultImg = document.getElementById("btnNewsUseDefaultImg");
        if (btnNewsUseDefaultImg) btnNewsUseDefaultImg.textContent = lang === "en" ? "🏁 Use official FFC background" : "🏁 Usar fondo oficial FFC";

        const lblNewsSubmitTitle_es = document.getElementById("lblNewsSubmitTitle_es");
        if (lblNewsSubmitTitle_es) lblNewsSubmitTitle_es.innerHTML = '<span class="flag-mini">🇪🇸</span> ' + (lang === "en" ? 'TITLE IN SPANISH <span class="required-star">*</span>' : 'TÍTULO EN ESPAÑOL <span class="required-star">*</span>');
        const newsSubmitTitle_es = document.getElementById("newsSubmitTitle_es");
        if (newsSubmitTitle_es) newsSubmitTitle_es.placeholder = lang === "en" ? "Enter headline in Spanish..." : "Escribe el titular en español...";

        const lblNewsSubmitSummary_es = document.getElementById("lblNewsSubmitSummary_es");
        if (lblNewsSubmitSummary_es) lblNewsSubmitSummary_es.innerHTML = '<span class="flag-mini">🇪🇸</span> ' + (lang === "en" ? 'SUBTITLE / SUMMARY IN SPANISH' : 'SUBTÍTULO / RESUMEN EN ESPAÑOL');
        const newsSubmitSummary_es = document.getElementById("newsSubmitSummary_es");
        if (newsSubmitSummary_es) newsSubmitSummary_es.placeholder = lang === "en" ? "Write a brief subtitle or summary in Spanish..." : "Escribe un breve subtítulo o resumen de 1-2 frases en español...";

        const lblNewsSubmitContent_es = document.getElementById("lblNewsSubmitContent_es");
        if (lblNewsSubmitContent_es) lblNewsSubmitContent_es.innerHTML = '<span class="flag-mini">🇪🇸</span> ' + (lang === "en" ? 'ARTICLE BODY (SPANISH) <span class="required-star">*</span>' : 'CUERPO DEL ARTÍCULO (ESPAÑOL) <span class="required-star">*</span>');

        const lblNewsSubmitTitle_en = document.getElementById("lblNewsSubmitTitle_en");
        if (lblNewsSubmitTitle_en) lblNewsSubmitTitle_en.innerHTML = '<span class="flag-mini">🇬🇧</span> ' + (lang === "en" ? 'ARTICLE TITLE (ENGLISH) <span class="required-star">*</span>' : 'TÍTULO EN INGLÉS <span class="required-star">*</span>');
        const newsSubmitTitle_en = document.getElementById("newsSubmitTitle_en");
        if (newsSubmitTitle_en) newsSubmitTitle_en.placeholder = lang === "en" ? "Enter headline in English..." : "Escribe el titular en inglés...";

        const lblNewsSubmitSummary_en = document.getElementById("lblNewsSubmitSummary_en");
        if (lblNewsSubmitSummary_en) lblNewsSubmitSummary_en.innerHTML = '<span class="flag-mini">🇬🇧</span> ' + (lang === "en" ? 'SUBTITLE / SUMMARY (ENGLISH)' : 'SUBTÍTULO / RESUMEN EN INGLÉS');
        const newsSubmitSummary_en = document.getElementById("newsSubmitSummary_en");
        if (newsSubmitSummary_en) newsSubmitSummary_en.placeholder = lang === "en" ? "Write a brief subtitle or 1-2 sentence summary in English..." : "Escribe un breve subtítulo o resumen de 1-2 frases en inglés...";

        const lblNewsSubmitContent_en = document.getElementById("lblNewsSubmitContent_en");
        if (lblNewsSubmitContent_en) lblNewsSubmitContent_en.innerHTML = '<span class="flag-mini">🇬🇧</span> ' + (lang === "en" ? 'ARTICLE BODY (ENGLISH) <span class="required-star">*</span>' : 'CUERPO DEL ARTÍCULO (INGLÉS) <span class="required-star">*</span>');

        const lblNewsSubmitCategory = document.getElementById("lblNewsSubmitCategory");
        if (lblNewsSubmitCategory) lblNewsSubmitCategory.innerHTML = dict.news.labelCategory;
        const newsSubmitCategory = document.getElementById("newsSubmitCategory");
        if (newsSubmitCategory && newsSubmitCategory.options) {
            const optMap = {
                "Carreras": dict.news.catOptionRaces,
                "Fichajes": dict.news.catOptionTransfers,
                "Pilotos": dict.news.catOptionDrivers,
                "Crónicas": dict.news.catOptionReports,
                "Comunidad": dict.news.catOptionCommunity,
                "Técnica": dict.news.catOptionTech
            };
            Array.from(newsSubmitCategory.options).forEach(opt => {
                if (optMap[opt.value]) opt.textContent = optMap[opt.value];
            });
        }

        const lblNewsSubmitAuthor = document.getElementById("lblNewsSubmitAuthor");
        if (lblNewsSubmitAuthor) lblNewsSubmitAuthor.innerHTML = dict.news.labelAuthor;
        const newsSubmitAuthor = document.getElementById("newsSubmitAuthor");
        if (newsSubmitAuthor) newsSubmitAuthor.placeholder = dict.news.placeholderAuthor;

        const newsSubmitModerationNoticeText = document.getElementById("newsSubmitModerationNoticeText");
        if (newsSubmitModerationNoticeText) newsSubmitModerationNoticeText.textContent = lang === "en" ? "All articles are reviewed by administrators before being published on the official site." : "Todas las noticias se revisan por administradores antes de publicarse en la web.";

        const newsSubmitCancelBtn = document.getElementById("newsSubmitCancelBtn");
        if (newsSubmitCancelBtn) newsSubmitCancelBtn.textContent = dict.news.btnCancel;
        const btnSubmitNewsFormAction = document.getElementById("btnSubmitNewsFormAction");
        if (btnSubmitNewsFormAction && !btnSubmitNewsFormAction.disabled && !window.ffcEditingArticleId) {
            btnSubmitNewsFormAction.innerHTML = dict.news.btnSubmitAction;
        }

        if (typeof updateEditorWordStats === "function") {
            updateEditorWordStats();
        }

        // Article Reader Modal
        const btnEditCurrentArticleText = document.getElementById("btnEditCurrentArticleText");
        if (btnEditCurrentArticleText) {
            btnEditCurrentArticleText.textContent = lang === "en" ? "Edit Article" : "Editar Noticia";
        }
        const btnShareArticleLink = document.getElementById("btnShareArticleLink");
        if (btnShareArticleLink) {
            btnShareArticleLink.innerHTML = dict.news.shareBtn;
        }
        const newsCommentsHeading = document.getElementById("newsCommentsHeading");
        if (newsCommentsHeading) newsCommentsHeading.textContent = dict.news.commentsHeading;
        const newsCommentAuthorInput = document.getElementById("newsCommentAuthorInput");
        if (newsCommentAuthorInput) newsCommentAuthorInput.placeholder = dict.news.commentAuthorPlaceholder;
        const newsCommentTextInput = document.getElementById("newsCommentTextInput");
        if (newsCommentTextInput) newsCommentTextInput.placeholder = dict.news.commentTextPlaceholder;
        const btnSubmitComment = document.getElementById("btnSubmitComment");
        if (btnSubmitComment && !btnSubmitComment.disabled) {
            btnSubmitComment.innerHTML = dict.news.commentSubmitBtn;
        }

        // Re-render news grid cards with updated language
        if (typeof renderPublicNewsSection === "function") {
            renderPublicNewsSection();
        }

        // If reader modal is open, re-render article details in the selected website language
        if (typeof window.ffcActiveReadingArticle !== "undefined" && window.ffcActiveReadingArticle) {
            if (typeof renderArticleModalContent === "function") {
                renderArticleModalContent(window.ffcActiveReadingArticle, lang);
            }
            const count = typeof window.ffcActiveReadingArticle.commentsCount === "number" ? window.ffcActiveReadingArticle.commentsCount : 0;
            const commentsCountText = document.getElementById("articleCommentsCountText");
            if (commentsCountText) {
                commentsCountText.textContent = `${count} ${lang === "en" ? (count === 1 ? "comment" : "comments") : (count === 1 ? "comentario" : "comentarios")}`;
            }
            if (typeof loadCachedComments === "function" && typeof renderCommentsList === "function") {
                const cachedComments = loadCachedComments(window.ffcActiveReadingArticle.id);
                renderCommentsList(cachedComments, window.ffcActiveReadingArticle.id);
            }
        }
    }

    // Driver Comparator Modal translations
    const cmp = dict.compare || (dict.news && dict.news.compare);
    if (cmp) {
        const lblCompareTitle = document.getElementById("lblCompareTitle");
        if (lblCompareTitle) lblCompareTitle.textContent = cmp.title;
        const lblCompareSub = document.getElementById("lblCompareSub");
        if (lblCompareSub) lblCompareSub.textContent = cmp.sub;
        const lblComparePresets = document.getElementById("lblComparePresets");
        if (lblComparePresets) lblComparePresets.textContent = cmp.presets;
        const lblSelectDriverA = document.getElementById("lblSelectDriverA");
        if (lblSelectDriverA) lblSelectDriverA.textContent = cmp.driverA;
        const lblSelectDriverB = document.getElementById("lblSelectDriverB");
        if (lblSelectDriverB) lblSelectDriverB.textContent = cmp.driverB;
        const compareSwapBtn = document.getElementById("compareSwapBtn");
        if (compareSwapBtn) compareSwapBtn.title = cmp.swapTitle;
        const lblModeMutual = document.getElementById("lblModeMutual");
        if (lblModeMutual) lblModeMutual.textContent = cmp.modeMutual;
        const btnCompareModeMutual = document.getElementById("btnCompareModeMutual");
        if (btnCompareModeMutual) btnCompareModeMutual.title = cmp.modeMutualTitle;
        const lblModeAll = document.getElementById("lblModeAll");
        if (lblModeAll) lblModeAll.textContent = cmp.modeAll;
        const btnCompareModeAll = document.getElementById("btnCompareModeAll");
        if (btnCompareModeAll) btnCompareModeAll.title = cmp.modeAllTitle;

        const compareModeInfoText = document.getElementById("compareModeInfoText");
        if (compareModeInfoText && typeof compareMode !== "undefined") {
            compareModeInfoText.textContent = compareMode === "mutual" ? cmp.modeInfoMutual : cmp.modeInfoAll;
        }

        const lblH2HVerdict = document.getElementById("lblH2HVerdict");
        if (lblH2HVerdict) lblH2HVerdict.textContent = cmp.h2hVerdict;
        const lblH2HVerdictSub = document.getElementById("lblH2HVerdictSub");
        if (lblH2HVerdictSub) lblH2HVerdictSub.textContent = cmp.h2hSub;

        const lblMetricsTitle = document.getElementById("lblMetricsTitle");
        if (lblMetricsTitle) lblMetricsTitle.textContent = cmp.metricsTitle;
        const lblMetricsSub = document.getElementById("lblMetricsSub");
        if (lblMetricsSub) lblMetricsSub.textContent = cmp.metricsSub;
        const lblSkillsTitle = document.getElementById("lblSkillsTitle");
        if (lblSkillsTitle) lblSkillsTitle.textContent = cmp.skillsTitle;
        const lblSkillsSub = document.getElementById("lblSkillsSub");
        if (lblSkillsSub) lblSkillsSub.textContent = cmp.skillsSub;
        const lblCompareRoundsTitle = document.getElementById("lblCompareRoundsTitle");
        if (lblCompareRoundsTitle) lblCompareRoundsTitle.textContent = cmp.roundsTitle;
        const lblCompareRoundsSub = document.getElementById("lblCompareRoundsSub");
        if (lblCompareRoundsSub) lblCompareRoundsSub.textContent = cmp.roundsSub;

        const thRoundCol = document.getElementById("thRoundCol");
        if (thRoundCol) thRoundCol.textContent = cmp.thRound;
        const thGpCol = document.getElementById("thGpCol");
        if (thGpCol) thGpCol.textContent = cmp.thGp;
        const thDuelCol = document.getElementById("thDuelCol");
        if (thDuelCol) thDuelCol.textContent = cmp.thDuel;
        const thDiffCol = document.getElementById("thDiffCol");
        if (thDiffCol) thDiffCol.textContent = cmp.thDiff;
    }

    if (typeof document.getElementById("driverCompareOverlay") !== "undefined" && document.getElementById("driverCompareOverlay")?.classList.contains("is-active")) {
        if (typeof compareDriverA !== "undefined" && typeof compareDriverB !== "undefined") {
            renderDriverComparison(compareDriverA, compareDriverB);
        }
    }

    // Calendar cards status & country
    updateCalendarCards(lang);

    // Standings expand button text & ranking board re-render
    if (typeof getSavedStandings === "function") {
        const drivers = getSavedStandings();
        renderStandingsOnPage(drivers);
        updateStandingsToggleUI(drivers.length);
    }
}

/* =========================================================
   FLAGS & TIMEZONES CONFIGURATION
========================================================= */

const FLAG_SVGS = {
    es: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 17" width="24" height="17" class="flag-svg" aria-hidden="true"><rect width="24" height="17" fill="#c60b1e"/><rect y="4.25" width="24" height="8.5" fill="#ffc400"/><circle cx="6.5" cy="8.5" r="2.2" fill="#c60b1e"/><rect x="5.8" y="7" width="1.4" height="3" fill="#ffc400"/><circle cx="6.5" cy="6.2" r="0.8" fill="#c60b1e"/></svg>`,
    uk: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 60 30" width="24" height="17" class="flag-svg" aria-hidden="true"><rect width="60" height="30" fill="#012169"/><path d="M0 0 L60 30 M60 0 L0 30" stroke="#FFFFFF" stroke-width="6"/><path d="M0 0 L30 15 M60 30 L30 15" stroke="#C8102E" stroke-width="2"/><path d="M60 0 L30 15 M0 30 L30 15" stroke="#C8102E" stroke-width="2"/><path d="M30 0 v30 M0 15 h60" stroke="#FFFFFF" stroke-width="10"/><path d="M30 0 v30 M0 15 h60" stroke="#C8102E" stroke-width="6"/></svg>`,
    ar: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 17" width="24" height="17" class="flag-svg" aria-hidden="true"><rect width="24" height="17" fill="#74ACDF"/><rect y="5.66" width="24" height="5.68" fill="#FFFFFF"/><circle cx="12" cy="8.5" r="2" fill="#F6B40E"/><circle cx="12" cy="8.5" r="1.1" fill="#843511"/><path d="M12 5.5v6 M9 8.5h6 M10 6.5l4 4 M14 6.5l-4 4" stroke="#F6B40E" stroke-width="0.7"/></svg>`,
    mx: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 17" width="24" height="17" class="flag-svg" aria-hidden="true"><rect width="8" height="17" fill="#006847"/><rect x="8" width="8" height="17" fill="#FFFFFF"/><rect x="16" width="8" height="17" fill="#CE1126"/><circle cx="12" cy="8.5" r="1.8" fill="#8B5A2B"/><circle cx="12" cy="8.5" r="1.1" fill="#556B2F"/></svg>`,
    co: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 17" width="24" height="17" class="flag-svg" aria-hidden="true"><rect width="24" height="8.5" fill="#FCD116"/><rect y="8.5" width="24" height="4.25" fill="#003893"/><rect y="12.75" width="24" height="4.25" fill="#CE1126"/></svg>`,
    cl: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 17" width="24" height="17" class="flag-svg" aria-hidden="true"><rect y="8.5" width="24" height="8.5" fill="#D52B1E"/><rect width="24" height="8.5" fill="#FFFFFF"/><rect width="8.5" height="8.5" fill="#0039A6"/><polygon points="4.25,2 4.9,4.2 7.1,4.2 5.3,5.5 6,7.7 4.25,6.3 2.5,7.7 3.2,5.5 1.4,4.2 3.6,4.2" fill="#FFFFFF"/></svg>`,
    br: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 17" width="24" height="17" class="flag-svg" aria-hidden="true"><rect width="24" height="17" fill="#009739"/><polygon points="12,2.2 21.8,8.5 12,14.8 2.2,8.5" fill="#FEDD00"/><circle cx="12" cy="8.5" r="3.8" fill="#012169"/><path d="M8.8 8.2 Q12 6.8 15.2 8.8" stroke="#FFFFFF" stroke-width="0.8" fill="none"/></svg>`,
    us: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 17" width="24" height="17" class="flag-svg" aria-hidden="true"><rect width="24" height="17" fill="#B22234"/><path d="M0 1.3h24 M0 3.9h24 M0 6.5h24 M0 9.1h24 M0 11.7h24 M0 14.3h24" stroke="#FFFFFF" stroke-width="1.3"/><rect width="10" height="9.1" fill="#3C3B6E"/><circle cx="2.5" cy="2.3" r="0.6" fill="#FFFFFF"/><circle cx="5" cy="2.3" r="0.6" fill="#FFFFFF"/><circle cx="7.5" cy="2.3" r="0.6" fill="#FFFFFF"/><circle cx="3.75" cy="4.55" r="0.6" fill="#FFFFFF"/><circle cx="6.25" cy="4.55" r="0.6" fill="#FFFFFF"/><circle cx="2.5" cy="6.8" r="0.6" fill="#FFFFFF"/><circle cx="5" cy="6.8" r="0.6" fill="#FFFFFF"/><circle cx="7.5" cy="6.8" r="0.6" fill="#FFFFFF"/></svg>`,
    jp: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 17" width="24" height="17" class="flag-svg" aria-hidden="true"><rect width="24" height="17" fill="#FFFFFF"/><circle cx="12" cy="8.5" r="5" fill="#BC002D"/></svg>`,
    au: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 17" width="24" height="17" class="flag-svg" aria-hidden="true"><rect width="24" height="17" fill="#00008B"/><g transform="scale(0.4, 0.55)"><rect width="24" height="15" fill="#012169"/><path d="M0 0 L24 15 M24 0 L0 15" stroke="#FFFFFF" stroke-width="2.5"/><path d="M0 0 L12 7.5 M24 15 L12 7.5" stroke="#C8102E" stroke-width="1"/><path d="M24 0 L12 7.5 M0 15 L12 7.5" stroke="#C8102E" stroke-width="1"/><path d="M12 0 v15 M0 7.5 h24" stroke="#FFFFFF" stroke-width="4"/><path d="M12 0 v15 M0 7.5 h24" stroke="#C8102E" stroke-width="2.2"/></g><polygon points="4.8,12 5.2,13 6.2,12.7 5.6,13.6 6.1,14.5 5.1,14.1 4.6,15 4.5,14 3.5,14.1 4.2,13.4 3.7,12.5 4.6,12.9" fill="#FFFFFF"/><circle cx="18" cy="4.2" r="0.75" fill="#FFFFFF"/><circle cx="20.5" cy="6" r="0.75" fill="#FFFFFF"/><circle cx="19.2" cy="9.6" r="0.75" fill="#FFFFFF"/><circle cx="15.6" cy="8.4" r="0.75" fill="#FFFFFF"/><circle cx="17.4" cy="13.2" r="0.95" fill="#FFFFFF"/></svg>`,
    utc: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 17" width="24" height="17" class="flag-svg" aria-hidden="true"><rect width="24" height="17" fill="#0b1320"/><circle cx="12" cy="8.5" r="6" fill="none" stroke="#38bdf8" stroke-width="1.3"/><ellipse cx="12" cy="8.5" rx="3" ry="6" fill="none" stroke="#38bdf8" stroke-width="1"/><line x1="6" y1="8.5" x2="18" y2="8.5" stroke="#38bdf8" stroke-width="1"/><line x1="7.5" y1="5.1" x2="16.5" y2="5.1" stroke="#38bdf8" stroke-width="0.85"/><line x1="7.5" y1="11.9" x2="16.5" y2="11.9" stroke="#38bdf8" stroke-width="0.85"/></svg>`
};

const FLAG_SVG_ES = FLAG_SVGS.es;
const FLAG_SVG_UK = FLAG_SVGS.uk;

const TIMEZONES = [
    { id: "Europe/Madrid", city: "Madrid", country: "España", flagSvg: FLAG_SVGS.es, short: "MADRID", tzCode: "CET/CEST", note: "Hora oficial (Base)" },
    { id: "Europe/London", city: "Londres", country: "Reino Unido", flagSvg: FLAG_SVGS.uk, short: "LONDRES", tzCode: "GMT/BST", note: "UK / Irlanda" },
    { id: "America/Argentina/Buenos_Aires", city: "Buenos Aires", country: "Argentina", flagSvg: FLAG_SVGS.ar, short: "BS. AIRES", tzCode: "ART", note: "UTC-3" },
    { id: "America/Mexico_City", city: "Ciudad de México", country: "México", flagSvg: FLAG_SVGS.mx, short: "CDMX", tzCode: "CST", note: "UTC-6" },
    { id: "America/Bogota", city: "Bogotá", country: "Colombia", flagSvg: FLAG_SVGS.co, short: "BOGOTÁ", tzCode: "COT", note: "UTC-5" },
    { id: "America/Santiago", city: "Santiago", country: "Chile", flagSvg: FLAG_SVGS.cl, short: "SANTIAGO", tzCode: "CLT", note: "Chile" },
    { id: "America/Sao_Paulo", city: "São Paulo", country: "Brasil", flagSvg: FLAG_SVGS.br, short: "SÃO PAULO", tzCode: "BRT", note: "UTC-3" },
    { id: "America/New_York", city: "Nueva York", country: "EE.UU. (Este)", flagSvg: FLAG_SVGS.us, short: "NUEVA YORK", tzCode: "EDT/EST", note: "Miami / NY" },
    { id: "America/Los_Angeles", city: "Los Ángeles", country: "EE.UU. (Oeste)", flagSvg: FLAG_SVGS.us, short: "LOS ÁNGELES", tzCode: "PDT/PST", note: "California" },
    { id: "Asia/Tokyo", city: "Tokio", country: "Japón", flagSvg: FLAG_SVGS.jp, short: "TOKIO", tzCode: "JST", note: "UTC+9" },
    { id: "Australia/Sydney", city: "Sídney", country: "Australia", flagSvg: FLAG_SVGS.au, short: "SÍDNEY", tzCode: "AEST/AEDT", note: "Oceanía" },
    { id: "UTC", city: "Tiempo Universal", country: "UTC / GMT", flagSvg: FLAG_SVGS.utc, short: "UTC", tzCode: "UTC", note: "Universal" }
];

const TIMEZONE_FLAGS = {
    "Europe/Madrid": "🇪🇸",
    "Europe/London": "🇬🇧",
    "America/Argentina/Buenos_Aires": "🇦🇷",
    "America/Mexico_City": "🇲🇽",
    "America/Bogota": "🇨🇴",
    "America/Santiago": "🇨🇱",
    "America/Sao_Paulo": "🇧🇷",
    "America/New_York": "🇺🇸",
    "America/Los_Angeles": "🇺🇸",
    "Asia/Tokyo": "🇯🇵",
    "Australia/Sydney": "🇦🇺",
    "UTC": "🌐"
};

let selectedTimezone = (() => {
    try {
        const saved = localStorage.getItem("ffc_timezone");
        if (saved && TIMEZONES.some(t => t.id === saved)) return saved;
    } catch (e) {}
    return "Europe/Madrid";
})();

// Format race date/time from Europe/Madrid to any target timezone
function formatRaceForTimezone(dateTimeStr, targetTz, lang = currentLanguage) {
    const epochMs = getMadridEpochMs(dateTimeStr);
    if (isNaN(epochMs)) return null;

    const dateObj = new Date(epochMs);
    const locale = lang === "es" ? "es-ES" : "en-US";

    const partsFormatter = new Intl.DateTimeFormat(locale, {
        timeZone: targetTz,
        day: 'numeric',
        month: 'short',
        hour: '2-digit',
        minute: '2-digit',
        timeZoneName: 'short',
        hour12: false
    });

    const parts = partsFormatter.formatToParts(dateObj);
    const p = {};
    for (const part of parts) p[part.type] = part.value;

    const day = p.day || "";
    const month = (p.month || "").replace('.', '').toUpperCase();
    const hour = p.hour || "00";
    const minute = p.minute || "00";
    let tzName = p.timeZoneName || "";

    if (targetTz === "Europe/Madrid") {
        tzName = tzName.includes("CEST") ? "CEST" : (tzName.includes("CET") ? "CET" : tzName);
    } else if (targetTz === "UTC") {
        tzName = "UTC";
    }

    return {
        epochMs,
        day,
        month,
        time: `${hour}:${minute}`,
        tzName,
        dateTextCard: `${day} ${month} · ${hour}:${minute} <span>${tzName}</span>`,
        fullTimeStr: `${hour}:${minute} ${tzName}`
    };
}

function getTimezoneOffsetHours(timeZone, dateObj = new Date()) {
    try {
        const utcDate = new Date(dateObj.toLocaleString('en-US', { timeZone: 'UTC' }));
        const tzDate = new Date(dateObj.toLocaleString('en-US', { timeZone }));
        return (tzDate.getTime() - utcDate.getTime()) / (60 * 60 * 1000);
    } catch (e) {
        return 0;
    }
}

function getTimezoneBadge(targetTz, dateObj = new Date()) {
    const offsetHours = getTimezoneOffsetHours(targetTz, dateObj);
    const sign = offsetHours >= 0 ? "+" : "-";
    const abs = Math.abs(offsetHours);
    const wholeHours = Math.floor(abs);
    const minutes = Math.round((abs - wholeHours) * 60);
    if (offsetHours === 0) return "UTC";
    return minutes > 0 
        ? `GMT${sign}${wholeHours}:${String(minutes).padStart(2, '0')}`
        : `GMT${sign}${wholeHours}`;
}

function renderTimezoneOptions() {
    const selectEl = document.getElementById("profileTzSelect");
    const listEl = document.getElementById("tzOptionsList");
    const profileTzBadge = document.getElementById("profileTzBadge");

    const race = getSavedNextRace();
    const raceDateTime = race?.dateTime || "2026-09-20T16:30";
    const epochMs = getMadridEpochMs(raceDateTime);
    const raceDateObj = !isNaN(epochMs) ? new Date(epochMs) : new Date();

    // Sort timezones from greatest to least ("de más a menos", e.g. +10 down to -7)
    const sortedTimezones = [...TIMEZONES].sort((a, b) => {
        const offsetA = getTimezoneOffsetHours(a.id, raceDateObj);
        const offsetB = getTimezoneOffsetHours(b.id, raceDateObj);
        if (offsetB !== offsetA) {
            return offsetB - offsetA; // Descending: de más a menos
        }
        return a.city.localeCompare(b.city);
    });

    if (selectEl) {
        selectEl.innerHTML = "";
        const isEnglish = currentLanguage === "en";
        sortedTimezones.forEach(tz => {
            const tzBadge = getTimezoneBadge(tz.id, raceDateObj);
            const flag = TIMEZONE_FLAGS[tz.id] || "🏁";
            const opt = document.createElement("option");
            opt.value = tz.id;
            opt.selected = (tz.id === selectedTimezone);
            const isBase = tz.id === "Europe/Madrid";
            const baseTag = isBase ? (isEnglish ? " · FFC Base" : " · Base Oficial") : "";
            opt.textContent = `${flag} ${tz.city} (${tzBadge})${baseTag}`;
            selectEl.appendChild(opt);
        });
        selectEl.value = selectedTimezone;
    }

    if (profileTzBadge) {
        const activeTzBadge = getTimezoneBadge(selectedTimezone, raceDateObj);
        profileTzBadge.textContent = selectedTimezone === "Europe/Madrid" ? "BASE: MADRID" : activeTzBadge;
    }

    if (listEl) {
        listEl.innerHTML = "";
        sortedTimezones.forEach(tz => {
            const isActive = tz.id === selectedTimezone;
            const tzBadge = getTimezoneBadge(tz.id, raceDateObj);

            const btn = document.createElement("button");
            btn.type = "button";
            btn.className = `tz-option${isActive ? " active" : ""}`;
            btn.setAttribute("role", "option");
            btn.setAttribute("aria-selected", isActive ? "true" : "false");
            btn.setAttribute("data-tz", tz && tz.id ? tz.id : "");
            try {
                if (btn.dataset) {
                    btn.dataset.tz = tz && tz.id ? tz.id : "";
                }
            } catch (e) {}

            btn.innerHTML = `
                <span class="tz-flag">${tz.flagSvg}</span>
                <div class="tz-info">
                    <span class="tz-city">${escapeHtml(tz.city)} <small style="opacity:0.75; font-size:10.5px;">(${escapeHtml(tz.country)})</small></span>
                    <span class="tz-sub">${escapeHtml(tz.note)}</span>
                </div>
                <span class="tz-time-preview">${escapeHtml(tzBadge)}</span>
                <span class="tz-check" aria-hidden="true">✓</span>
            `;

            btn.addEventListener("click", () => {
                setTimezone(tz.id);
                closeAllDropdowns();
            });

            listEl.appendChild(btn);
        });
    }

    const currentTzCodeEl = document.getElementById("currentTzCode");
    const currentTzFlagEl = document.getElementById("currentTzFlag");
    const activeTz = TIMEZONES.find(t => t.id === selectedTimezone) || TIMEZONES[0];
    if (currentTzCodeEl) {
        currentTzCodeEl.textContent = activeTz.short;
    }
    if (currentTzFlagEl) {
        currentTzFlagEl.innerHTML = activeTz.flagSvg;
    }
}

function setTimezone(tzId) {
    const found = TIMEZONES.find(t => t.id === tzId);
    if (!found) tzId = "Europe/Madrid";
    selectedTimezone = tzId;
    try {
        localStorage.setItem("ffc_timezone", tzId);
    } catch (e) {
        console.error("Error saving timezone preference:", e);
    }

    const selectEl = document.getElementById("profileTzSelect");
    if (selectEl && selectEl.value !== tzId) {
        selectEl.value = tzId;
    }

    const profileTzBadge = document.getElementById("profileTzBadge");
    if (profileTzBadge) {
        const race = getSavedNextRace();
        const raceDateTime = race?.dateTime || "2026-09-20T16:30";
        const epochMs = getMadridEpochMs(raceDateTime);
        const raceDateObj = !isNaN(epochMs) ? new Date(epochMs) : new Date();
        const activeTzBadge = getTimezoneBadge(selectedTimezone, raceDateObj);
        profileTzBadge.textContent = selectedTimezone === "Europe/Madrid" ? "BASE: MADRID" : activeTzBadge;
    }

    const currentTzCodeEl = document.getElementById("currentTzCode");
    const currentTzFlagEl = document.getElementById("currentTzFlag");
    const activeTz = TIMEZONES.find(t => t.id === tzId) || TIMEZONES[0];
    if (currentTzCodeEl) {
        currentTzCodeEl.textContent = activeTz.short;
    }
    if (currentTzFlagEl) {
        currentTzFlagEl.innerHTML = activeTz.flagSvg;
    }

    // Persist timezone preference to Firestore if user is authenticated
    if (typeof activeUserAuth !== "undefined" && activeUserAuth && activeUserAuth.uid && typeof db !== "undefined") {
        try {
            setDoc(doc(db, "usuarios", activeUserAuth.uid), { timezone: tzId }, { merge: true }).catch(() => {});
            if (activeUserAuth.email && typeof getUserDocId === "function") {
                setDoc(doc(db, "usuarios", getUserDocId(activeUserAuth.email)), { timezone: tzId }, { merge: true }).catch(() => {});
            }
        } catch (e) {}
    }

    renderNextRaceOnPage(getSavedNextRace());
}

function closeAllDropdowns() {
    const langDd = document.getElementById("langDropdown");
    const tzDd = document.getElementById("tzDropdown");
    const userDd = document.getElementById("userAuthDropdown");
    const langBtn = document.getElementById("langDropdownBtn");
    const tzBtn = document.getElementById("tzDropdownBtn");
    const authBtn = document.getElementById("authHeaderBtn");

    if (langDd) langDd.classList.remove("is-open");
    if (tzDd) tzDd.classList.remove("is-open");
    if (userDd) userDd.classList.remove("is-open");
    if (langBtn) langBtn.setAttribute("aria-expanded", "false");
    if (tzBtn) tzBtn.setAttribute("aria-expanded", "false");
    if (authBtn) authBtn.setAttribute("aria-expanded", "false");
}

function initCustomDropdowns() {
    const langDropdown = document.getElementById("langDropdown");
    const langDropdownBtn = document.getElementById("langDropdownBtn");
    const tzDropdown = document.getElementById("tzDropdown");
    const tzDropdownBtn = document.getElementById("tzDropdownBtn");

    if (langDropdownBtn && langDropdown) {
        langDropdownBtn.addEventListener("click", (e) => {
            e.stopPropagation();
            const isOpen = langDropdown.classList.contains("is-open");
            closeAllDropdowns();
            if (!isOpen) {
                langDropdown.classList.add("is-open");
                langDropdownBtn.setAttribute("aria-expanded", "true");
            }
        });
    }

    const optEs = document.getElementById("langOptEs");
    const optEn = document.getElementById("langOptEn");
    if (optEs) {
        optEs.addEventListener("click", (e) => {
            e.stopPropagation();
            setLanguage("es");
            closeAllDropdowns();
        });
    }
    if (optEn) {
        optEn.addEventListener("click", (e) => {
            e.stopPropagation();
            setLanguage("en");
            closeAllDropdowns();
        });
    }

    if (tzDropdownBtn && tzDropdown) {
        tzDropdownBtn.addEventListener("click", (e) => {
            e.stopPropagation();
            const isOpen = tzDropdown.classList.contains("is-open");
            closeAllDropdowns();
            if (!isOpen) {
                renderTimezoneOptions();
                tzDropdown.classList.add("is-open");
                tzDropdownBtn.setAttribute("aria-expanded", "true");
            }
        });
    }

    const profileTzSelect = document.getElementById("profileTzSelect");
    if (profileTzSelect) {
        profileTzSelect.addEventListener("change", (e) => {
            setTimezone(e.target.value);
        });
    }

    document.addEventListener("click", (e) => {
        if (!e.target.closest(".custom-dropdown")) {
            closeAllDropdowns();
        }
    });

    document.addEventListener("keydown", (e) => {
        if (e.key === "Escape") {
            closeAllDropdowns();
        }
    });
}

function setLanguage(lang) {
    if (lang !== "es" && lang !== "en") lang = "es";
    currentLanguage = lang;
    try {
        localStorage.setItem("ffc_language", lang);
    } catch (e) {
        console.error("Error saving language preference:", e);
    }

    document.documentElement.lang = lang;

    // Update Dropdown Trigger UI
    const currentLangFlag = document.getElementById("currentLangFlag");
    const currentLangCode = document.getElementById("currentLangCode");
    if (currentLangFlag) {
        currentLangFlag.innerHTML = lang === "es" ? FLAG_SVG_ES : FLAG_SVG_UK;
    }
    if (currentLangCode) {
        currentLangCode.textContent = lang.toUpperCase();
    }

    // Update Options State
    const optEs = document.getElementById("langOptEs");
    const optEn = document.getElementById("langOptEn");
    if (optEs) {
        const isEs = lang === "es";
        optEs.classList.toggle("active", isEs);
        optEs.setAttribute("aria-selected", isEs ? "true" : "false");
    }
    if (optEn) {
        const isEn = lang === "en";
        optEn.classList.toggle("active", isEn);
        optEn.setAttribute("aria-selected", isEn ? "true" : "false");
    }

    // Update Profile Language Buttons State
    const profileLangEsBtn = document.getElementById("profileLangEsBtn");
    const profileLangEnBtn = document.getElementById("profileLangEnBtn");
    if (profileLangEsBtn) profileLangEsBtn.classList.toggle("active", lang === "es");
    if (profileLangEnBtn) profileLangEnBtn.classList.toggle("active", lang === "en");

    applyTranslations(lang);
    renderNextRaceOnPage(getSavedNextRace());
    if (typeof renderPublicNewsSection === "function") {
        renderPublicNewsSection();
    }
    if (typeof renderAdminNewsTab === "function") {
        renderAdminNewsTab();
    }
    if (window.ffcActiveReadingArticle && typeof setArticleModalLang === "function") {
        setArticleModalLang(lang);
    }
    if (typeof currentOpenModalDriver !== "undefined" && currentOpenModalDriver) {
        openDriverStatsModal(currentOpenModalDriver);
    }
    if (typeof currentOpenModalTeam !== "undefined" && currentOpenModalTeam) {
        openTeamStatsModal(currentOpenModalTeam);
    }
    if (typeof refreshAllCalendarCards === "function") {
        refreshAllCalendarCards();
    }
}


/* =========================================================
   RACE RESULTS DATA
========================================================= */

const defaultRaceResults = {

    australia: {

        round: "ROUND 01",
        title: "AUSTRALIA",
        location: "MELBOURNE · AUSTRALIA",
        date: "14 JUN",

        winner: "IvánR",
        pole: "IvánR · 1:20.843",
        fastest: "IvánR · 1:22.300",
        driverDay: "BigTheo",
        replayUrl: "https://www.youtube.com/watch?v=dQw4w9WgXcQ",

        drivers: [

            { pos: 1, driver: "IvánR", team: "HRT", status: "FINISHED" },
            { pos: 2, driver: "BigTheo", team: "Ferrari", status: "FINISHED" },
            { pos: 3, driver: "Dieguiosk", team: "HRT", status: "FINISHED" },
            { pos: 4, driver: "TheWereGH", team: "Sauber", status: "FINISHED" },
            { pos: 5, driver: "Sir Galactic", team: "Renault", status: "FINISHED" },
            { pos: 6, driver: "AMF", team: "Williams", status: "FINISHED" },
            { pos: 7, driver: "Daidaiiro", team: "Lotus", status: "FINISHED" },
            { pos: 8, driver: "Dericcc", team: "Virgin", status: "FINISHED" },
            { pos: 9, driver: "J-DOT", team: "McLaren", status: "FINISHED" },
            { pos: 10, driver: "Baena", team: "Mercedes", status: "FINISHED" },
            { pos: 11, driver: "CarlosUre", team: "Force India", status: "DNF" },
            { pos: 12, driver: "TucnakCZE", team: "Force India", status: "DNF" },
            { pos: 13, driver: "Sbinn", team: "Toro Rosso", status: "DNF" },
            { pos: 14, driver: "Y6NJ", team: "Red Bull", status: "DNF" }

        ]

    },


    malaysia: {

        round: "ROUND 02",
        title: "MALAYSIA",
        location: "SEPANG · MALAYSIA",
        date: "28 JUN",

        winner: "IvánR",
        pole: "IvánR · 1:33.062",
        fastest: "IvánR · 1:33.662",
        driverDay: "IvánR",

        drivers: [

            { pos: 1, driver: "IvánR", team: "HRT", status: "FINISHED" },
            { pos: 2, driver: "Muntii", team: "Red Bull", status: "FINISHED" },
            { pos: 3, driver: "Baena", team: "Mercedes", status: "FINISHED" },
            { pos: 4, driver: "BigTheo", team: "Ferrari", status: "FINISHED" },
            { pos: 5, driver: "Dieguiosk", team: "HRT", status: "FINISHED" },
            { pos: 6, driver: "Viktolo", team: "Toro Rosso", status: "FINISHED" },
            { pos: 7, driver: "TheWereGH", team: "Sauber", status: "FINISHED" },
            { pos: 8, driver: "AMF", team: "Williams", status: "FINISHED" },
            { pos: 9, driver: "Daidaiiro", team: "Lotus", status: "FINISHED" },
            { pos: 10, driver: "Novi", team: "Ferrari", status: "FINISHED" },
            { pos: 11, driver: "Suforr", team: "Mercedes", status: "DNF" },
            { pos: 12, driver: "Nando_FA14", team: "HRT", status: "DNF" },
            { pos: 13, driver: "Oscar Soria", team: "Williams", status: "DNF" },
            { pos: 14, driver: "Drips", team: "McLaren", status: "DNF" }

        ]

    },


    bahrain: {

        round: "ROUND 03",
        title: "BAHRAIN",
        location: "SAKHIR · BAHRAIN",
        date: "12 JUL",

        winner: "Sbinn",
        pole: "Dieguiosk · 1:29.938",
        fastest: "Dieguiosk · 1:30.946",
        driverDay: "Sbinn",

        drivers: [

            { pos: 1, driver: "Sbinn", team: "Toro Rosso", status: "FINISHED" },
            { pos: 2, driver: "ElMamut", team: "Virgin", status: "FINISHED" },
            { pos: 3, driver: "CarlosUre", team: "Force India", status: "FINISHED" },
            { pos: 4, driver: "Dieguiosk", team: "HRT", status: "FINISHED" },
            { pos: 5, driver: "Muntii", team: "Red Bull", status: "FINISHED" },
            { pos: 6, driver: "BigTheo", team: "Ferrari", status: "FINISHED" },
            { pos: 7, driver: "Sir Galactic", team: "Renault", status: "FINISHED" },
            { pos: 8, driver: "Licha", team: "Ferrari", status: "FINISHED" },
            { pos: 9, driver: "AMF", team: "Williams", status: "FINISHED" },
            { pos: 10, driver: "Daidaiiro", team: "Lotus", status: "FINISHED" },
            { pos: 11, driver: "ElNano", team: "Force India", status: "FINISHED" },
            { pos: 12, driver: "Nando_FA14", team: "HRT", status: "FINISHED" },
            { pos: 13, driver: "Oscar Soria", team: "Williams", status: "FINISHED" },
            { pos: 14, driver: "Dericcc", team: "Virgin", status: "FINISHED" },
            { pos: 15, driver: "TheAgus60", team: "McLaren", status: "DNF" },
            { pos: 16, driver: "Novi", team: "Ferrari", status: "DNF" },
            { pos: 17, driver: "Baena", team: "Mercedes", status: "DNF" },
            { pos: 18, driver: "IvánR", team: "HRT", status: "DNF" }

        ]

    },


    turkey: {

        round: "ROUND 04",
        title: "TURKEY",
        location: "ISTANBUL PARK · TURKEY",
        date: "19 JUL",

        winner: "Suforr",
        pole: "Suforr · 1:25.843",
        fastest: "Novitaa · 1:27.846",
        driverDay: "Suforr",

        drivers: [

            { pos: 1, driver: "Suforr", team: "Mercedes", status: "FINISHED" },
            { pos: 2, driver: "Muntii", team: "Red Bull", status: "FINISHED" },
            { pos: 3, driver: "DiegoSniper69", team: "Sauber", status: "FINISHED" },
            { pos: 4, driver: "BigTheo", team: "Ferrari", status: "FINISHED" },
            { pos: 5, driver: "Sbinn", team: "Toro Rosso", status: "FINISHED" },
            { pos: 6, driver: "Novitaa", team: "Red Bull", status: "FINISHED" },
            { pos: 7, driver: "Dieguiosk", team: "HRT", status: "FINISHED" },
            { pos: 8, driver: "Viktolo", team: "Toro Rosso", status: "FINISHED" },
            { pos: 9, driver: "Licha", team: "Ferrari", status: "FINISHED" },
            { pos: 10, driver: "TheWereGH", team: "Sauber", status: "FINISHED" },
            { pos: 11, driver: "IvánR", team: "HRT", status: "DNF" },
            { pos: 12, driver: "Rafale", team: "McLaren", status: "DNF" }

        ]

    },


    spain: {

        round: "ROUND 05",
        title: "SPAIN",
        location: "BARCELONA · SPAIN",
        date: "09 AUG",

        winner: "Dieguiosk",
        pole: "Dieguiosk · 1:14.578",
        fastest: "BigTheo · 1:17.346",
        driverDay: "Dieguiosk",

        drivers: [

            { pos: 1, driver: "Dieguiosk", team: "HRT", status: "FINISHED" },
            { pos: 2, driver: "Muntii", team: "Red Bull", status: "FINISHED" },
            { pos: 3, driver: "Novitaa", team: "Red Bull", status: "FINISHED" },
            { pos: 4, driver: "BigTheo", team: "Ferrari", status: "FINISHED" },
            { pos: 5, driver: "Suforr", team: "Mercedes", status: "FINISHED" },
            { pos: 6, driver: "Nando_FA14", team: "HRT", status: "FINISHED" },
            { pos: 7, driver: "AMF", team: "Williams", status: "FINISHED" },
            { pos: 8, driver: "Licha", team: "Ferrari", status: "FINISHED" },
            { pos: 9, driver: "Rafale", team: "McLaren", status: "FINISHED" },
            { pos: 10, driver: "Dericcc", team: "Virgin", status: "FINISHED" },
            { pos: 11, driver: "TheWereGH", team: "Sauber", status: "DNF" },
            { pos: 12, driver: "ElMamut", team: "Virgin", status: "DNF" },
            { pos: 13, driver: "Kri", team: "Renault", status: "DNF" }

        ]

    },


    italy: {

        round: "ROUND 06",
        title: "ITALY",
        location: "MONZA · ITALY",
        date: "17 AUG",

        winner: "Novitaa",
        pole: "Novitaa · 1:22.222",
        fastest: "Novitaa · 1:22.759",
        driverDay: "Novitaa",

        drivers: [

            { pos: 1, driver: "Novitaa", team: "Red Bull", status: "FINISHED" },
            { pos: 2, driver: "Dieguiosk", team: "HRT", status: "FINISHED" },
            { pos: 3, driver: "Erik Brenna", team: "Force India", status: "FINISHED" },
            { pos: 4, driver: "Kri", team: "Renault", status: "FINISHED" },
            { pos: 5, driver: "Novi", team: "Ferrari", status: "FINISHED" },
            { pos: 6, driver: "Viktolo", team: "Toro Rosso", status: "FINISHED" },
            { pos: 7, driver: "Muntii", team: "Red Bull", status: "FINISHED" },
            { pos: 8, driver: "Rafale", team: "McLaren", status: "FINISHED" },
            { pos: 9, driver: "TheWereGH", team: "Sauber", status: "FINISHED" },
            { pos: 10, driver: "Licha", team: "Ferrari", status: "FINISHED" },
            { pos: 11, driver: "Suforr", team: "Mercedes", status: "DNF" },
            { pos: 12, driver: "Sbinn", team: "Toro Rosso", status: "DNF" },
            { pos: 13, driver: "Dericcc", team: "Virgin", status: "DNF" },
            { pos: 14, driver: "Zenthix", team: "Williams", status: "DNF" }

        ]

    },


    austria: {

        round: "ROUND 07",
        title: "AUSTRIA",
        location: "RED BULL RING · AUSTRIA",
        date: "23 AUG",

        winner: "Dieguiosk",
        pole: "Dieguiosk · 1:09.297",
        fastest: "Suforr · 1:09.619",
        driverDay: "Gold",

        drivers: [

            { pos: 1, driver: "Dieguiosk", team: "HRT", status: "FINISHED" },
            { pos: 2, driver: "Gold", team: "Williams", status: "FINISHED" },
            { pos: 3, driver: "Muntii", team: "Red Bull", status: "FINISHED" },
            { pos: 4, driver: "Suforr", team: "Mercedes", status: "FINISHED" },
            { pos: 5, driver: "Licha", team: "Ferrari", status: "FINISHED" },
            { pos: 6, driver: "Krisdemurr", team: "Williams", status: "FINISHED" },
            { pos: 7, driver: "Farlonso", team: "Lotus", status: "FINISHED" },
            { pos: 8, driver: "TheAgus60", team: "McLaren", status: "FINISHED" },
            { pos: 9, driver: "Novitaa", team: "Red Bull", status: "FINISHED" },
            { pos: 10, driver: "TheWereGH", team: "Sauber", status: "FINISHED" },
            { pos: 11, driver: "BigTheo", team: "Ferrari", status: "DNF" },
            { pos: 12, driver: "Sbinn", team: "Toro Rosso", status: "DNF" },
            { pos: 13, driver: "Dericcc", team: "Virgin", status: "DNF" },
            { pos: 14, driver: "Nando_FA14", team: "HRT", status: "DNF" },
            { pos: 15, driver: "Novi", team: "Ferrari", status: "DNF" },
            { pos: 16, driver: "Viktolo", team: "Toro Rosso", status: "DNF" },
            { pos: 17, driver: "Rafale", team: "McLaren", status: "DSQ" },
            { pos: 18, driver: "Kri", team: "Renault", status: "DSQ" }

        ]

    },


    silverstone: {

        round: "ROUND 08",
        title: "GREAT BRITAIN",
        location: "SILVERSTONE · UNITED KINGDOM",
        date: "07 SEP",

        winner: "Muntii",
        pole: "Novitaa · 1:28.943",
        fastest: "Dieguiosk · 1:30.468",
        driverDay: "Victor",

        drivers: [

            { pos: 1, driver: "Muntii", team: "Red Bull", status: "FINISHED" },
            { pos: 2, driver: "Novitaa", team: "Red Bull", status: "FINISHED" },
            { pos: 3, driver: "Dieguiosk", team: "HRT", status: "FINISHED" },
            { pos: 4, driver: "Victor", team: "McLaren", status: "FINISHED" },
            { pos: 5, driver: "Licha", team: "Ferrari", status: "FINISHED" },
            { pos: 6, driver: "Dericcc", team: "Virgin", status: "FINISHED" },
            { pos: 7, driver: "Farlonso", team: "Lotus", status: "FINISHED" },
            { pos: 8, driver: "TheWereGH", team: "Sauber", status: "FINISHED" },
            { pos: 9, driver: "Gold", team: "Williams", status: "FINISHED" },
            { pos: 10, driver: "BigTheo", team: "Ferrari", status: "FINISHED" },
            { pos: 11, driver: "Suforr", team: "Mercedes", status: "DNF" },
            { pos: 12, driver: "Novi", team: "Ferrari", status: "DNF" },
            { pos: 13, driver: "Krisdemurr", team: "Williams", status: "DNF" },
            { pos: 14, driver: "RikiDorsa", team: "Virgin", status: "DNF" }

        ]

    },


    hockenheim: {

        round: "ROUND 09",
        title: "HOCKENHEIM",
        location: "HOCKENHEIMRING · GERMANY",
        date: "13 SEP",

        winner: "Dieguiosk",
        pole: "Novitaa · 1:14.751",
        fastest: "Suforr · 1:14.395",
        driverDay: "Dieguiosk",

        drivers: [

            { pos: 1, driver: "Dieguiosk", team: "HRT", status: "FINISHED" },
            { pos: 2, driver: "Novitaa", team: "Red Bull", status: "FINISHED" },
            { pos: 3, driver: "Muntii", team: "Red Bull", status: "FINISHED" },
            { pos: 4, driver: "Lil", team: "Lotus", status: "FINISHED" },
            { pos: 5, driver: "Victor", team: "McLaren", status: "FINISHED" },
            { pos: 6, driver: "Farlonso", team: "Lotus", status: "FINISHED" },
            { pos: 7, driver: "TheWereGH", team: "Sauber", status: "FINISHED" },
            { pos: 8, driver: "Suforr", team: "Mercedes", status: "FINISHED" },
            { pos: 9, driver: "Licha", team: "Ferrari", status: "FINISHED" },
            { pos: 10, driver: "TheAgus60", team: "McLaren", status: "FINISHED" },
            { pos: 11, driver: "N. Duro", team: "Ferrari", status: "FINISHED" },
            { pos: 12, driver: "Dericcc", team: "Virgin", status: "DNF" },
            { pos: 13, driver: "Kri", team: "Renault", status: "DNF" }

        ]

    },

    nurburgring: {
        round: "ROUND 10",
        title: "NÜRBURGRING GP",
        location: "NÜRBURGRING · EUROPE",
        date: "20 SEP",
        status: "NEXT RACE",
        winner: "TBA",
        pole: "TBA",
        fastest: "TBA",
        driverDay: "TBA",
        drivers: []
    },

    hungary: {
        round: "ROUND 11",
        title: "HUNGARORING",
        location: "BUDAPEST · HUNGARY",
        date: "TBA",
        status: "UPCOMING",
        winner: "TBA",
        pole: "TBA",
        fastest: "TBA",
        driverDay: "TBA",
        drivers: []
    },

    belgium: {
        round: "ROUND 12",
        title: "SPA-FRANCORCHAMPS",
        location: "SPA · BELGIUM",
        date: "TBA",
        status: "UPCOMING",
        winner: "TBA",
        pole: "TBA",
        fastest: "TBA",
        driverDay: "TBA",
        drivers: []
    },

    singapore: {
        round: "ROUND 13",
        title: "SINGAPORE",
        location: "MARINA BAY · SINGAPORE",
        date: "TBA",
        status: "UPCOMING",
        winner: "TBA",
        pole: "TBA",
        fastest: "TBA",
        driverDay: "TBA",
        drivers: []
    },

    cota: {
        round: "ROUND 14",
        title: "COTA",
        location: "AUSTIN · USA",
        date: "TBA",
        status: "UPCOMING",
        winner: "TBA",
        pole: "TBA",
        fastest: "TBA",
        driverDay: "TBA",
        drivers: []
    },

    brazil: {
        round: "ROUND 15",
        title: "BRAZIL",
        location: "INTERLAGOS · BRAZIL",
        date: "TBA",
        status: "FINAL ROUND",
        winner: "TBA",
        pole: "TBA",
        fastest: "TBA",
        driverDay: "TBA",
        drivers: []
    }

};

let raceResults = { ...defaultRaceResults };

const seasonRacesMeta = {
    australia: { round: "ROUND 01", title: "AUSTRALIA", location: "MELBOURNE · AUSTRALIA", date: "14 JUN" },
    malaysia: { round: "ROUND 02", title: "MALAYSIA", location: "SEPANG · MALAYSIA", date: "28 JUN" },
    bahrain: { round: "ROUND 03", title: "BAHRAIN", location: "SAKHIR · BAHRAIN", date: "12 JUL" },
    turkey: { round: "ROUND 04", title: "TURKEY", location: "ISTANBUL PARK · TURKEY", date: "19 JUL" },
    spain: { round: "ROUND 05", title: "BARCELONA", location: "BARCELONA · SPAIN", date: "9 AUG" },
    italy: { round: "ROUND 06", title: "MONZA", location: "MONZA · ITALY", date: "17 AUG" },
    austria: { round: "ROUND 07", title: "AUSTRIA", location: "RED BULL RING · AUSTRIA", date: "23 AUG" },
    silverstone: { round: "ROUND 08", title: "SILVERSTONE", location: "SILVERSTONE · UNITED KINGDOM", date: "7 SEP" },
    hockenheim: { round: "ROUND 09", title: "HOCKENHEIM", location: "HOCKENHEIMRING · GERMANY", date: "13 SEP" },
    nurburgring: { round: "ROUND 10", title: "NÜRBURGRING GP", location: "NÜRBURGRING · EUROPE", date: "20 SEP" },
    hungary: { round: "ROUND 11", title: "HUNGARORING", location: "BUDAPEST · HUNGARY", date: "27 SEP" },
    belgium: { round: "ROUND 12", title: "SPA-FRANCORCHAMPS", location: "SPA · BELGIUM", date: "04 OCT" },
    singapore: { round: "ROUND 13", title: "SINGAPORE", location: "MARINA BAY · SINGAPORE", date: "11 OCT" },
    cota: { round: "ROUND 14", title: "COTA", location: "AUSTIN · USA", date: "18 OCT" },
    brazil: { round: "ROUND 15", title: "BRAZIL", location: "INTERLAGOS · BRAZIL", date: "25 OCT" }
};

const SEASON_RACE_ORDER = [
    "australia",
    "malaysia",
    "bahrain",
    "turkey",
    "spain",
    "italy",
    "austria",
    "silverstone",
    "hockenheim",
    "nurburgring",
    "hungary",
    "belgium",
    "singapore",
    "cota",
    "brazil"
];

function isRaceFinished(raceData) {
    if (!raceData) return false;
    if (raceData.status === "COMPLETED") return true;
    if (raceData.status === "UPCOMING" || raceData.status === "NEXT RACE") return false;
    return Boolean(
        raceData.winner && 
        raceData.winner !== "TBA" && 
        Array.isArray(raceData.drivers) && 
        raceData.drivers.length > 0
    );
}

function determineNextUpcomingRaceKey(racesMap = raceResults) {
    if (!racesMap) racesMap = raceResults;
    for (const key of SEASON_RACE_ORDER) {
        const rData = racesMap[key];
        if (!isRaceFinished(rData)) {
            return key;
        }
    }
    return "brazil";
}

function refreshAllCalendarCards() {
    const nextKey = determineNextUpcomingRaceKey(raceResults);
    const curLang = typeof currentLanguage !== "undefined" ? currentLanguage : "es";
    const isEn = curLang === "en";

    SEASON_RACE_ORDER.forEach((key, idx) => {
        const rData = raceResults[key] || seasonRacesMeta[key];
        let card = document.querySelector(`.calendar-card[data-race="${key}"]`);
        if (!card) {
            const meta = seasonRacesMeta[key];
            if (meta && meta.round) {
                const roundNum = meta.round.replace(/ROUND\s*/i, "").trim();
                const cards = document.querySelectorAll(".calendar-card");
                cards.forEach(c => {
                    const numEl = c.querySelector(".calendar-number");
                    if (numEl && numEl.textContent.trim() === roundNum) {
                        card = c;
                    }
                });
            }
        }
        if (!card) return;

        card.setAttribute("data-race", key);

        const isCompleted = isRaceFinished(rData);
        const isNext = (!isCompleted && key === nextKey);
        const statusEl = card.querySelector(".calendar-status");
        const dateEl = card.querySelector(".calendar-date");

        if (rData && rData.date && rData.date !== "TBA" && dateEl) {
            dateEl.textContent = rData.date;
        }

        // Reset classes
        card.classList.remove("completed", "next", "upcoming", "race-link");

        // Clear dynamic elements
        const oldHint = card.querySelector(".click-hint");
        if (oldHint) oldHint.remove();
        const oldNote = card.querySelector(".calendar-action-note");
        if (oldNote) oldNote.remove();

        if (isCompleted) {
            card.classList.add("completed", "race-link");
            if (statusEl) {
                statusEl.textContent = isEn ? "COMPLETED" : "COMPLETADA";
            }
            const hint = document.createElement("span");
            hint.className = "click-hint";
            hint.textContent = (translations[curLang]?.calendar?.viewResults) || (isEn ? "RESULTS →" : "RESULTADOS →");
            const footer = card.querySelector(".calendar-card-footer") || card;
            footer.appendChild(hint);
            card.onclick = () => openRace(key);
        } else if (isNext) {
            card.classList.add("next", "race-link");
            if (statusEl) {
                statusEl.textContent = isEn ? "NEXT RACE" : "PRÓXIMA CARRERA";
            }
            const note = document.createElement("span");
            note.className = "calendar-action-note";
            note.id = "nextRaceActionNote";
            note.textContent = isEn ? "THIS WEEKEND" : "ESTE FIN DE SEMANA";
            const footer = card.querySelector(".calendar-card-footer") || card;
            footer.appendChild(note);
            card.onclick = () => openRace(key);
        } else {
            card.classList.add("upcoming", "race-link");
            const isFinal = (key === "brazil" || idx === 14);
            if (statusEl) {
                if (isFinal) {
                    statusEl.textContent = isEn ? "FINAL ROUND" : "RONDA FINAL";
                } else {
                    statusEl.textContent = isEn ? "UPCOMING" : "PRÓXIMAMENTE";
                }
            }
            card.onclick = () => openRace(key);
        }

        // Replay button on card if replayUrl exists
        let replayBtn = card.querySelector(".card-replay-btn");
        if (rData && rData.replayUrl && rData.replayUrl.trim() !== "") {
            if (!replayBtn) {
                replayBtn = document.createElement("a");
                replayBtn.className = "card-replay-btn";
                replayBtn.target = "_blank";
                replayBtn.rel = "noopener noreferrer";
                replayBtn.setAttribute("aria-label", "Ver repetición de la carrera");
                replayBtn.innerHTML = `<svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor"><path d="M8 5v14l11-7z"/></svg>`;
                const header = card.querySelector(".calendar-card-header") || card;
                header.appendChild(replayBtn);
            }
            replayBtn.href = rData.replayUrl.trim();
            replayBtn.title = isEn ? "Watch race replay" : "Ver repetición de la carrera";
            replayBtn.onclick = (e) => { e.stopPropagation(); };
        } else if (replayBtn) {
            replayBtn.remove();
        }
    });
}

function findRaceKeyFromNextRace(raceObj) {
    if (!raceObj) return null;
    if (typeof raceObj === "string") {
        const str = raceObj.toLowerCase().trim();
        if (SEASON_RACE_ORDER.includes(str)) return str;
        for (const key of SEASON_RACE_ORDER) {
            const meta = seasonRacesMeta[key];
            if (meta) {
                if (meta.title && str.includes(meta.title.toLowerCase())) return key;
                if (meta.round && str.includes(meta.round.toLowerCase())) return key;
                if (meta.location && str.includes(meta.location.toLowerCase())) return key;
            }
        }
        return null;
    }

    const round = (raceObj.round || "").toLowerCase();
    const title = (raceObj.title || "").toLowerCase();

    for (const key of SEASON_RACE_ORDER) {
        const meta = seasonRacesMeta[key];
        const preset = (typeof OFFICIAL_GP_PRESETS !== "undefined") ? OFFICIAL_GP_PRESETS[key] : null;
        if (meta) {
            if (round && meta.round && round.includes(meta.round.toLowerCase())) return key;
            if (title && meta.title && (title.includes(meta.title.toLowerCase()) || meta.title.toLowerCase().includes(title))) return key;
        }
        if (preset) {
            if (round && preset.round && round.includes(preset.round.toLowerCase())) return key;
            if (title && preset.title && (title.includes(preset.title.toLowerCase()) || preset.title.toLowerCase().includes(title))) return key;
        }
    }

    const roundMatch = round.match(/\d+/);
    if (roundMatch) {
        const roundNum = parseInt(roundMatch[0], 10);
        if (roundNum >= 1 && roundNum <= SEASON_RACE_ORDER.length) {
            return SEASON_RACE_ORDER[roundNum - 1];
        }
    }

    return null;
}
window.findRaceKeyFromNextRace = findRaceKeyFromNextRace;

async function ensurePreviousRacesCompletedForNextRace(targetRaceKey, autoSaveFirestore = true) {
    if (!targetRaceKey || !SEASON_RACE_ORDER.includes(targetRaceKey)) return [];

    const targetIndex = SEASON_RACE_ORDER.indexOf(targetRaceKey);
    const affectedPriorKeys = [];

    // All races preceding targetRaceKey in the season order MUST be marked as COMPLETED
    for (let i = 0; i < targetIndex; i++) {
        const prevKey = SEASON_RACE_ORDER[i];
        let prevData = raceResults[prevKey] || seasonRacesMeta[prevKey] || {};

        if (!isRaceFinished(prevData)) {
            const meta = seasonRacesMeta[prevKey] || {
                round: `ROUND ${String(i + 1).padStart(2, "0")}`,
                title: prevKey.toUpperCase(),
                location: prevKey.toUpperCase(),
                date: "TBA"
            };

            const updatedPrev = {
                ...prevData,
                status: "COMPLETED",
                round: prevData.round || meta.round,
                title: prevData.title || meta.title,
                location: prevData.location || meta.location,
                date: prevData.date || meta.date || "TBA"
            };

            // If it had no drivers, fill with default positions from standings
            if (!Array.isArray(updatedPrev.drivers) || updatedPrev.drivers.length === 0) {
                const currentStandings = getSavedStandings();
                if (currentStandings && currentStandings.length > 0) {
                    updatedPrev.drivers = currentStandings.slice(0, 10).map((d, idx) => ({
                        pos: idx + 1,
                        driver: d.driver,
                        team: d.team || getDriverTeam(d.driver),
                        status: "FINISHED"
                    }));
                }
            }

            if (!updatedPrev.winner || updatedPrev.winner === "TBA") {
                if (updatedPrev.drivers && updatedPrev.drivers[0]) {
                    updatedPrev.winner = updatedPrev.drivers[0].driver;
                }
            }

            raceResults[prevKey] = updatedPrev;
            affectedPriorKeys.push(prevKey);

            if (autoSaveFirestore && typeof db !== "undefined") {
                try {
                    await setDoc(doc(db, "carreras", prevKey), updatedPrev);
                } catch (err) {
                    console.error(`Error auto-saving completed previous race ${prevKey} to Firestore:`, err);
                }
            }
        }
    }

    // Ensure the target race itself is marked as UPCOMING
    let targetData = raceResults[targetRaceKey] || seasonRacesMeta[targetRaceKey] || {};
    if (isRaceFinished(targetData)) {
        const targetMeta = seasonRacesMeta[targetRaceKey] || {};
        const updatedTarget = {
            ...targetData,
            status: "UPCOMING",
            round: targetData.round || targetMeta.round,
            title: targetData.title || targetMeta.title,
            location: targetData.location || targetMeta.location,
            date: targetData.date || targetMeta.date || "TBA"
        };
        raceResults[targetRaceKey] = updatedTarget;
        if (autoSaveFirestore && typeof db !== "undefined") {
            try {
                await setDoc(doc(db, "carreras", targetRaceKey), updatedTarget);
            } catch (err) {
                console.error(`Error saving target upcoming race ${targetRaceKey} to Firestore:`, err);
            }
        }
    }

    refreshAllCalendarCards();
    await syncCalendarAndNextRace(autoSaveFirestore);
    if (affectedPriorKeys.length > 0) {
        await recalculateAndSyncStandings(raceResults);
    }

    return affectedPriorKeys;
}
window.ensurePreviousRacesCompletedForNextRace = ensurePreviousRacesCompletedForNextRace;

async function syncCalendarAndNextRace(autoSaveFirestore = true) {
    const nextKey = determineNextUpcomingRaceKey(raceResults);
    refreshAllCalendarCards();

    if (!nextKey) return;

    const preset = (typeof OFFICIAL_GP_PRESETS !== "undefined" && OFFICIAL_GP_PRESETS[nextKey]) ? OFFICIAL_GP_PRESETS[nextKey] : {};
    const meta = seasonRacesMeta[nextKey] || {};
    const rData = raceResults[nextKey] || {};

    const rawDateText = rData.dateText || preset.dateText || (meta.date && meta.date !== "TBA" ? `${meta.date} · 16:30 CEST` : "TBD · Por Determinar");
    const isTbd = Boolean(rData.isTbd || preset.isTbd || preset.dateTime === "TBD" || (rawDateText && (rawDateText.includes("TBA") || rawDateText.includes("TBD") || rawDateText.toUpperCase().includes("POR DETERMINAR"))));

    const computedNextRace = {
        round: meta.round || preset.round || `ROUND ${SEASON_RACE_ORDER.indexOf(nextKey) + 1}`,
        title: preset.title || (meta.title ? `${meta.title} GP` : nextKey.toUpperCase()),
        location: preset.location || meta.location || "CIRCUIT",
        dateText: rawDateText,
        dateTime: isTbd ? "TBD" : (rData.dateTime || preset.dateTime || (meta.dateTime || "2026-09-20T16:30")),
        weatherTemp: rData.weatherTemp || preset.weatherTemp || "22°C",
        weatherCondition: rData.weatherCondition || preset.weatherCondition || "sunny",
        isTbd: isTbd
    };

    currentNextRace = computedNextRace;
    renderNextRaceOnPage(currentNextRace);

    if (adminPanelOverlay && adminPanelOverlay.classList.contains("active")) {
        if (typeof populateAdminForms === "function") {
            populateAdminForms();
        }
    }

    if (autoSaveFirestore && typeof db !== "undefined") {
        try {
            await setDoc(doc(db, "configuracion", "proxima_carrera"), computedNextRace);
        } catch (err) {
            console.error("Error auto-saving updated next race to Firestore:", err);
        }
    }
}



/* =========================================================
   TEAM CSS CLASSES
========================================================= */

function getTeamClass(team) {

    const normalized = team.toLowerCase();

    if (normalized.includes("red bull")) return "team-redbull";
    if (normalized.includes("ferrari")) return "team-ferrari";
    if (normalized.includes("mercedes")) return "team-mercedes";
    if (normalized.includes("toro rosso")) return "team-tororosso";
    if (normalized.includes("sauber")) return "team-sauber";
    if (normalized.includes("mclaren")) return "team-mclaren";
    if (normalized.includes("williams")) return "team-williams";
    if (normalized.includes("lotus")) return "team-lotus";
    if (normalized.includes("virgin")) return "team-virgin";
    if (normalized.includes("renault")) return "team-renault";
    if (normalized.includes("force india")) return "team-forceindia";
    if (normalized.includes("hrt")) return "team-hrt";

    return "";
}


/* =========================================================
   RACE RESULTS MODAL
========================================================= */

const raceOverlay = document.getElementById("raceOverlay");
const closeRace = document.getElementById("closeRace");
const backToCalendar = document.getElementById("backToCalendar");

const resultRound = document.getElementById("resultRound");
const resultTitle = document.getElementById("resultTitle");
const resultLocation = document.getElementById("resultLocation");
const resultDate = document.getElementById("resultDate");

const resultWinner = document.getElementById("resultWinner");
const resultPole = document.getElementById("resultPole");
const resultFastest = document.getElementById("resultFastest");
const resultDriverDay = document.getElementById("resultDriverDay");

const resultRows = document.getElementById("resultRows");
const resultReplayBtn = document.getElementById("resultReplayBtn");
const resultReplayText = document.getElementById("resultReplayText");


function openRace(raceKey, highlightDriver = null) {

    currentOpenRaceKey = raceKey;
    const race = raceResults[raceKey];

    if (!race || !raceOverlay) return;

    resultRound.textContent = race.round;
    resultTitle.textContent = race.title;
    resultLocation.textContent = race.location;
    resultDate.textContent = race.date;

    resultWinner.textContent = race.winner || "—";
    resultPole.textContent = race.pole || "—";
    resultFastest.textContent = race.fastest || "—";
    resultDriverDay.textContent = race.driverDay || "—";

    const isEn = typeof currentLanguage !== "undefined" && currentLanguage === "en";

    // Handle Replay Link in Modal
    if (resultReplayBtn) {
        if (race.replayUrl && race.replayUrl.trim() !== "") {
            resultReplayBtn.href = race.replayUrl.trim();
            resultReplayBtn.style.display = "inline-flex";
            if (resultReplayText) {
                resultReplayText.textContent = isEn ? "view replay" : "ver repetición";
            }
        } else {
            resultReplayBtn.style.display = "none";
        }
    }

    resultRows.innerHTML = "";

    if (!race.drivers || race.drivers.length === 0) {
        const row = document.createElement("tr");
        row.innerHTML = `
            <td colspan="4" style="text-align: center; padding: 32px 16px; color: #8892b0;">
                <div style="font-family: 'Barlow Condensed', sans-serif; font-weight: 800; font-size: 15px; color: #f1f5f9; margin-bottom: 6px; letter-spacing: 1px;">
                    ${isEn ? "UPCOMING GRAND PRIX" : "PRÓXIMO GRAN PREMIO"}
                </div>
                <div style="font-size: 12px; color: #737a83;">
                    ${isEn ? "This race has not taken place yet. Full results will be published here after the race." : "Esta carrera aún no se ha disputado. Los resultados oficiales se publicarán aquí una vez finalizado el Gran Premio."}
                </div>
            </td>
        `;
        resultRows.appendChild(row);
    } else {
        const cleanHighlight = highlightDriver ? (typeof normalizeDriverKey === "function" ? normalizeDriverKey(highlightDriver) : highlightDriver.trim().toLowerCase()) : null;
        let highlightedElement = null;

        race.drivers.forEach((driver) => {

            const row = document.createElement("tr");
            const isTarget = cleanHighlight && (typeof normalizeDriverKey === "function" ? normalizeDriverKey(driver.driver) : driver.driver.trim().toLowerCase()) === cleanHighlight;

            if (isTarget) {
                row.classList.add("result-row-highlight");
                highlightedElement = row;
            }

            const statusClass =
                driver.status === "DNF" ? "status-dnf" :
                driver.status === "DNS" ? "status-dns" :
                driver.status === "DSQ" ? "status-dsq" :
                "";

            const displayStatus = (!isEn && driver.status === "FINISHED")
                ? "FINALIZADO"
                : driver.status;

            const driverTitle = isEn ? `View stats for ${driver.driver}` : `Ver estadísticas de ${driver.driver}`;

            row.innerHTML = `
                <td class="result-position">${driver.pos}</td>
                <td><span class="driver-clickable" data-driver="${escapeHtml(driver.driver)}" title="${driverTitle}">${escapeHtml(driver.driver)}</span></td>
                <td class="${getTeamClass(driver.team)}">${escapeHtml(driver.team)}</td>
                <td class="${statusClass}">${displayStatus}</td>
            `;

            resultRows.appendChild(row);

        });

        if (highlightedElement) {
            setTimeout(() => {
                highlightedElement.scrollIntoView({ behavior: "smooth", block: "nearest" });
            }, 150);
        }
    }

    raceOverlay.classList.add("active");
    document.body.classList.add("modal-open");

}


function closeRaceModal() {

    currentOpenRaceKey = null;
    if (!raceOverlay) return;

    raceOverlay.classList.remove("active");
    document.body.classList.remove("modal-open");

}

function navigateToRace(raceKey, driverName = null) {
    if (!raceKey) return;

    // 1. Close driver modal if open
    if (typeof closeDriverStatsModal === "function") {
        closeDriverStatsModal();
    }

    // 2. Locate and highlight corresponding calendar card
    const targetCard = document.querySelector(`.calendar-card[data-race="${raceKey}"]`);
    if (targetCard) {
        targetCard.scrollIntoView({ behavior: "smooth", block: "center" });
        targetCard.classList.remove("card-highlight-pulse");
        void targetCard.offsetWidth; // trigger CSS reflow
        targetCard.classList.add("card-highlight-pulse");
        setTimeout(() => {
            targetCard.classList.remove("card-highlight-pulse");
        }, 3000);
    } else {
        const cal = document.getElementById("calendar");
        if (cal) cal.scrollIntoView({ behavior: "smooth" });
    }

    // 3. Open the race results modal
    openRace(raceKey, driverName);
}


/* Calendar cards */

document.querySelectorAll(".calendar-card[data-race], .race-link").forEach((card) => {

    card.addEventListener("click", () => {

        const raceKey = card.dataset.race;
        if (raceKey) {
            openRace(raceKey);
        }

    });

});


if (closeRace) {
    closeRace.addEventListener("click", closeRaceModal);
}

if (backToCalendar) {
    backToCalendar.addEventListener("click", () => {
        const raceKeyToFocus = currentOpenRaceKey;
        closeRaceModal();
        if (raceKeyToFocus) {
            const card = document.querySelector(`.calendar-card[data-race="${raceKeyToFocus}"]`);
            if (card) {
                card.scrollIntoView({ behavior: "smooth", block: "center" });
                card.classList.remove("card-highlight-pulse");
                void card.offsetWidth;
                card.classList.add("card-highlight-pulse");
                setTimeout(() => card.classList.remove("card-highlight-pulse"), 3000);
                return;
            }
        }
        const cal = document.getElementById("calendar");
        if (cal) cal.scrollIntoView({ behavior: "smooth" });
    });
}


/* Click outside modal */

if (raceOverlay) {

    raceOverlay.addEventListener("click", (event) => {

        if (event.target === raceOverlay) {
            closeRaceModal();
        }

    });

}


/* ESC key */

document.addEventListener("keydown", (event) => {
    if (event.key === "Escape") {
        if (typeof closeRaceModal === "function") closeRaceModal();
        if (typeof closeUserAuthModal === "function") closeUserAuthModal();
        if (typeof closeAdminPanel === "function") closeAdminPanel();
        if (typeof closeDriverStatsModal === "function") closeDriverStatsModal();
        if (typeof closeTeamStatsModal === "function") closeTeamStatsModal();
        if (typeof closeCardEditorModal === "function") closeCardEditorModal();
        if (typeof closeDriverComparison === "function") closeDriverComparison();
        if (typeof closeSubmitNewsModal === "function") closeSubmitNewsModal();
        if (typeof closeNewsArticleModal === "function") closeNewsArticleModal();
    }
});


/* =========================================================
   SCROLL REVEAL
========================================================= */

const revealElements = document.querySelectorAll(
    ".standings-block, .calendar-card, .race-feature, .info-banner, .stat"
);

if ("IntersectionObserver" in window) {

    const observer = new IntersectionObserver(
        (entries) => {

            entries.forEach((entry) => {

                if (entry.isIntersecting) {

                    entry.target.classList.add("reveal");

                    requestAnimationFrame(() => {
                        entry.target.classList.add("visible");
                    });

                    observer.unobserve(entry.target);
                }

            });

        },
        {
            threshold: 0.08
        }
    );

    revealElements.forEach((element) => {
        observer.observe(element);
    });

} else {

    revealElements.forEach((element) => {
        element.classList.add("reveal", "visible");
    });

}


/* =========================================================
   ADMIN AUTHENTICATION & PANEL SYSTEM (AUTHORIZED ADMINS)
========================================================= */

const ADMIN_EMAILS = [
    "enzo.castillo.lomb@gmail.com",
    "formulafactorchampionship@gmail.com"
];
const ADMIN_EMAIL = ADMIN_EMAILS[0];

function isUserAdmin(user) {
    const u = user !== undefined ? user : (typeof activeUserAuth !== "undefined" && activeUserAuth ? activeUserAuth : (typeof LocalAuthStore !== "undefined" ? LocalAuthStore.getCurrentUser() : null));
    if (!u || !u.email) return false;
    const cleanEmail = u.email.trim().toLowerCase();
    return ADMIN_EMAILS.some(adminEmail => adminEmail.toLowerCase().trim() === cleanEmail);
}

// Default configuration datasets
const defaultNextRace = {
    round: "ROUND 10",
    title: "NÜRBURGRING GP",
    location: "NÜRBURGRING · EUROPE",
    dateText: "20 SEP · 16:30 CEST",
    dateTime: "2026-09-20T16:30",
    weatherTemp: "22°C",
    weatherCondition: "sunny"
};

const defaultStandings = [
    { pos: 1, driver: "Dieguiosk", team: "HRT", pts: 153 },
    { pos: 2, driver: "Muntii", team: "Red Bull", pts: 125 },
    { pos: 3, driver: "Novitaa", team: "Red Bull", pts: 88 },
    { pos: 4, driver: "BigTheo", team: "Ferrari", pts: 64 },
    { pos: 5, driver: "Suforr", team: "Mercedes", pts: 53 },
    { pos: 6, driver: "IvánR", team: "HRT", pts: 52 },
    { pos: 7, driver: "Sbinn", team: "Toro Rosso", pts: 35 },
    { pos: 8, driver: "Licha", team: "Ferrari", pts: 33 },
    { pos: 9, driver: "TheWereGH", team: "Sauber", pts: 32 },
    { pos: 10, driver: "Victor", team: "McLaren", pts: 22 },
    { pos: 11, driver: "Gold", team: "Williams", pts: 20 },
    { pos: 12, driver: "Viktolo", team: "Toro Rosso", pts: 20 },
    { pos: 13, driver: "Farlonso", team: "Lotus", pts: 20 },
    { pos: 14, driver: "AMF", team: "Williams", pts: 20 },
    { pos: 15, driver: "ElMamut", team: "Virgin", pts: 18 },
    { pos: 16, driver: "Baena", team: "Mercedes", pts: 16 },
    { pos: 17, driver: "Sir Galactic", team: "Renault", pts: 16 },
    { pos: 18, driver: "DiegoSniper69", team: "Sauber", pts: 15 },
    { pos: 19, driver: "Erik Brenna", team: "Force India", pts: 15 },
    { pos: 20, driver: "CarlosUre", team: "Force India", pts: 15 },
    { pos: 21, driver: "Dericcc", team: "Virgin", pts: 13 },
    { pos: 22, driver: "Lil", team: "Lotus", pts: 12 },
    { pos: 23, driver: "Kri", team: "Renault", pts: 12 },
    { pos: 24, driver: "Novi", team: "Ferrari", pts: 11 },
    { pos: 25, driver: "Daidaiiro", team: "Lotus", pts: 9 },
    { pos: 26, driver: "Nando_FA14", team: "HRT", pts: 8 },
    { pos: 27, driver: "Krisdemurr", team: "Williams", pts: 8 },
    { pos: 28, driver: "Rafale", team: "McLaren", pts: 6 },
    { pos: 29, driver: "TheAgus60", team: "McLaren", pts: 5 },
    { pos: 30, driver: "J-DOT", team: "McLaren", pts: 2 },
    { pos: 31, driver: "N. Duro", team: "Ferrari", pts: 1 },
    { pos: 32, driver: "TucnakCZE", team: "Force India", pts: 0 },
    { pos: 33, driver: "ElNano", team: "Force India", pts: 0 },
    { pos: 34, driver: "Oscar Soria", team: "Williams", pts: 0 },
    { pos: 35, driver: "RikiDorsa", team: "Virgin", pts: 0 },
    { pos: 36, driver: "Drips", team: "McLaren", pts: 0 },
    { pos: 37, driver: "Y6NJ", team: "Red Bull", pts: 0 },
    { pos: 38, driver: "Zenthix", team: "Williams", pts: 0 },
    { pos: 39, driver: "VGXEmi", team: "Force India", pts: 0 },
    { pos: 40, driver: "Zukini", team: "Toro Rosso", pts: 0 },
    { pos: 41, driver: "SkyFall", team: "Toro Rosso", pts: 0 },
    { pos: 42, driver: "Bartus", team: "Renault", pts: 0 },
    { pos: 43, driver: "Hpdypro27", team: "Red Bull", pts: 0 },
    { pos: 44, driver: "Galogb", team: "Lotus", pts: 0 }
];

const defaultDriverRoster = [
    { driver: "Dieguiosk", team: "HRT" },
    { driver: "Muntii", team: "Red Bull" },
    { driver: "Novitaa", team: "Red Bull" },
    { driver: "BigTheo", team: "Ferrari" },
    { driver: "Suforr", team: "Mercedes" },
    { driver: "IvánR", team: "HRT" },
    { driver: "Sbinn", team: "Toro Rosso" },
    { driver: "Licha", team: "Ferrari" },
    { driver: "TheWereGH", team: "Sauber" },
    { driver: "Victor", team: "McLaren" },
    { driver: "Gold", team: "Williams" },
    { driver: "Viktolo", team: "Toro Rosso" },
    { driver: "Farlonso", team: "Lotus" },
    { driver: "AMF", team: "Williams" },
    { driver: "ElMamut", team: "Virgin" },
    { driver: "Baena", team: "Mercedes" },
    { driver: "Sir Galactic", team: "Renault" },
    { driver: "DiegoSniper69", team: "Sauber" },
    { driver: "Erik Brenna", team: "Force India" },
    { driver: "CarlosUre", team: "Force India" },
    { driver: "Dericcc", team: "Virgin" },
    { driver: "Lil", team: "Lotus" },
    { driver: "Kri", team: "Renault" },
    { driver: "Novi", team: "Ferrari" },
    { driver: "Daidaiiro", team: "Lotus" },
    { driver: "Nando_FA14", team: "HRT" },
    { driver: "Krisdemurr", team: "Williams" },
    { driver: "Rafale", team: "McLaren" },
    { driver: "TheAgus60", team: "McLaren" },
    { driver: "J-DOT", team: "McLaren" },
    { driver: "N. Duro", team: "Ferrari" },
    { driver: "TucnakCZE", team: "Force India" },
    { driver: "ElNano", team: "Force India" },
    { driver: "Oscar Soria", team: "Williams" },
    { driver: "RikiDorsa", team: "Virgin" },
    { driver: "Drips", team: "McLaren" },
    { driver: "Y6NJ", team: "Red Bull" },
    { driver: "Zenthix", team: "Williams" },
    { driver: "VGXEmi", team: "Force India" },
    { driver: "Zukini", team: "Toro Rosso" },
    { driver: "SkyFall", team: "Toro Rosso" },
    { driver: "Bartus", team: "Renault" },
    { driver: "Hpdypro27", team: "Red Bull" },
    { driver: "Galogb", team: "Lotus" }
];

/* Official FFC 2010 Season Dataset (Exact mapping from Championship Spreadsheet) */
const ffc2010SeasonDrivers = [
    { pos: 1, number: 23, flag: "🇦🇱", driver: "Dieguiosk", team: "HRT", r: ["15", "10", "13*", "6", "25", "18", "25", "16*", "25", "--", "--", "--", "--", "--", "--"], pts: 153, dif: "--" },
    { pos: 2, number: 99, flag: "🇪🇸", driver: "Muntii", team: "Red Bull", r: ["--", "(18)", "10", "18", "18", "6", "15", "25", "15", "--", "--", "--", "--", "--", "--"], pts: 125, dif: "-28" },
    { pos: 3, number: 26, flag: "🇪🇸", driver: "Novitaa", team: "Red Bull", r: ["--", "--", "--", "9*", "15", "(26*)", "2", "(18)", "(18)", "--", "--", "--", "--", "--", "--"], pts: 88, dif: "-65" },
    { pos: 4, number: 5, flag: "🇪🇸", driver: "BigTheo", team: "Ferrari", r: ["18", "12", "8", "12", "13*", "--", "OUT", "1", "--", "--", "--", "--", "--", "--", "--"], pts: 64, dif: "-89" },
    { pos: 5, number: 92, flag: "🇪🇸", driver: "Suforr", team: "Mercedes", r: ["--", "OUT", "--", "(25)", "10", "OUT", "13*", "OUT", "5*", "--", "--", "--", "--", "--", "--"], pts: 53, dif: "-100" },
    { pos: 6, number: 7, flag: "🇲🇦", driver: "IvánR", team: "HRT", r: ["(26*)", "(26*)", "OUT", "OUT", "--", "--", "--", "--", "--", "--", "--", "--", "--", "--", "--"], pts: 52, dif: "-101" },
    { pos: 7, number: 88, flag: "🇪🇸", driver: "Sbinn", team: "Toro Rosso", r: ["OUT", "--", "25", "10", "--", "OUT", "OUT", "--", "--", "--", "--", "--", "--", "--", "--"], pts: 35, dif: "-118" },
    { pos: 8, number: 27, flag: "🇦🇷", driver: "Licha", team: "Ferrari", r: ["--", "--", "4", "2", "4", "1", "10", "10", "2", "--", "--", "--", "--", "--", "--"], pts: 33, dif: "-120" },
    { pos: 9, number: 21, flag: "🇪🇸", driver: "TheWereGH", team: "Sauber", r: ["12", "6", "--", "1", "OUT", "2", "1", "4", "6", "--", "--", "--", "--", "--", "--"], pts: 32, dif: "-121" },
    { pos: 10, number: 46, flag: "🇨🇭", driver: "Victor", team: "McLaren", r: ["--", "--", "--", "--", "--", "--", "--", "12", "10", "--", "--", "--", "--", "--", "--"], pts: 22, dif: "-131" },
    { pos: 11, number: 12, flag: "🇧🇷", driver: "Gold", team: "Williams", r: ["--", "--", "--", "--", "--", "--", "18", "2", "--", "--", "--", "--", "--", "--", "--"], pts: 20, dif: "-133" },
    { pos: 12, number: 22, flag: "🇦🇷", driver: "Viktolo", team: "Toro Rosso", r: ["--", "8", "--", "4", "8", "--", "OUT", "--", "--", "--", "--", "--", "--", "--", "--"], pts: 20, dif: "-133" },
    { pos: 13, number: 777, flag: "🏴󠁧󠁢󠁳󠁣󠁴󠁿", driver: "Farlonso", team: "Lotus", r: ["--", "--", "--", "--", "--", "--", "6", "6", "8", "--", "--", "--", "--", "--", "--"], pts: 20, dif: "-133" },
    { pos: 14, number: 29, flag: "🇨🇴", driver: "AMF", team: "Williams", r: ["8", "4", "2", "--", "6", "--", "--", "--", "--", "--", "--", "--", "--", "--", "--"], pts: 20, dif: "-133" },
    { pos: 15, number: 71, flag: "🇪🇸", driver: "ElMamut", team: "Virgin", r: ["--", "--", "18", "--", "OUT", "--", "--", "--", "--", "--", "--", "--", "--", "--", "--"], pts: 18, dif: "-135" },
    { pos: 16, number: 82, flag: "🇪🇸", driver: "Baena", team: "Mercedes", r: ["1", "15", "OUT", "--", "--", "--", "--", "--", "--", "--", "--", "--", "--", "--", "--"], pts: 16, dif: "-137" },
    { pos: 17, number: 2, flag: "🏴󠁧󠁢󠁳󠁣󠁴󠁿", driver: "Sir Galactic", team: "Renault", r: ["10", "--", "6", "--", "--", "--", "--", "--", "--", "--", "--", "--", "--", "--", "--"], pts: 16, dif: "-137" },
    { pos: 18, number: 32, flag: "🇪🇸", driver: "DiegoSniper69", team: "Sauber", r: ["--", "--", "--", "15", "--", "--", "--", "--", "--", "--", "--", "--", "--", "--", "--"], pts: 15, dif: "-138" },
    { pos: 19, number: 36, flag: "🇬🇧", driver: "Erik Brenna", team: "Force India", r: ["--", "--", "--", "--", "--", "15", "--", "--", "--", "--", "--", "--", "--", "--", "--"], pts: 15, dif: "-138" },
    { pos: 20, number: 24, flag: "🇪🇸", driver: "CarlosUre", team: "Force India", r: ["OUT", "--", "15", "--", "--", "--", "--", "--", "--", "--", "--", "--", "--", "--", "--"], pts: 15, dif: "-138" },
    { pos: 21, number: 13, flag: "🇪🇸", driver: "Dericcc", team: "Virgin", r: ["4", "--", "0", "--", "1", "OUT", "OUT", "8", "OUT", "--", "--", "--", "--", "--", "--"], pts: 13, dif: "-140" },
    { pos: 22, number: 45, flag: "🇪🇸", driver: "Lil", team: "Lotus", r: ["--", "--", "--", "--", "--", "--", "--", "--", "12", "--", "--", "--", "--", "--", "--"], pts: 12, dif: "-141" },
    { pos: 23, number: 88, flag: "🇧🇬", driver: "Kri", team: "Renault", r: ["--", "--", "--", "--", "OUT", "12", "OUT", "--", "OUT", "--", "--", "--", "--", "--", "--"], pts: 12, dif: "-141" },
    { pos: 24, number: 67, flag: "🏴󠁧󠁢󠁳󠁣󠁴󠁿", driver: "Novi", team: "Ferrari", r: ["--", "1", "OUT", "--", "--", "10", "OUT", "OUT", "--", "--", "--", "--", "--", "--", "--"], pts: 11, dif: "-142" },
    { pos: 25, number: 20, flag: "🇯🇵", driver: "Daidaiiro", team: "Lotus", r: ["6", "2", "1", "--", "--", "--", "--", "--", "--", "--", "--", "--", "--", "--", "--"], pts: 9, dif: "-144" },
    { pos: 26, number: 14, flag: "🇪🇸", driver: "Nando_FA14", team: "HRT", r: ["--", "OUT", "0", "--", "8", "OUT", "--", "--", "--", "--", "--", "--", "--", "--", "--"], pts: 8, dif: "-145" },
    { pos: 27, number: 43, flag: "🇧🇷", driver: "Krisdemurr", team: "Williams", r: ["--", "--", "--", "--", "--", "--", "8", "OUT", "--", "--", "--", "--", "--", "--", "--"], pts: 8, dif: "-145" },
    { pos: 28, number: 8, flag: "🇪🇸", driver: "Rafale", team: "McLaren", r: ["--", "--", "--", "OUT", "2", "4", "OUT", "--", "--", "--", "--", "--", "--", "--", "--"], pts: 6, dif: "-147" },
    { pos: 29, number: 69, flag: "🇪🇸", driver: "TheAgus60", team: "McLaren", r: ["--", "--", "OUT", "--", "--", "OUT", "4", "--", "1", "--", "--", "--", "--", "--", "--"], pts: 5, dif: "-148" },
    { pos: 30, number: 10, flag: "🇦🇷", driver: "J-DOT", team: "McLaren", r: ["2", "--", "--", "--", "--", "--", "--", "--", "--", "--", "--", "--", "--", "--", "--"], pts: 2, dif: "-151" },
    { pos: 31, number: 1, flag: "🇮🇹", driver: "N. Duro", team: "Ferrari", r: ["--", "--", "--", "--", "--", "--", "--", "--", "1", "--", "--", "--", "--", "--", "--"], pts: 1, dif: "-152" },
    { pos: 32, number: 34, flag: "🇨🇿", driver: "TucnakCZE", team: "Force India", r: ["OUT", "--", "--", "--", "--", "--", "--", "--", "--", "--", "--", "--", "--", "--", "--"], pts: 0, dif: "-153" },
    { pos: 33, number: 31, flag: "🇮🇹", driver: "ElNano", team: "Force India", r: ["--", "--", "0", "--", "--", "--", "--", "--", "--", "--", "--", "--", "--", "--", "--"], pts: 0, dif: "-153" },
    { pos: 34, number: 6, flag: "🇪🇸", driver: "Oscar Soria", team: "Williams", r: ["--", "OUT", "0", "--", "--", "--", "--", "--", "--", "--", "--", "--", "--", "--", "--"], pts: 0, dif: "-153" },
    { pos: 35, number: 85, flag: "🇪🇸", driver: "RikiDorsa", team: "Virgin", r: ["--", "--", "--", "--", "--", "--", "--", "OUT", "--", "--", "--", "--", "--", "--", "--"], pts: 0, dif: "-153" },
    { pos: 36, number: 11, flag: "🇦🇷", driver: "Drips", team: "McLaren", r: ["--", "OUT", "--", "--", "--", "--", "--", "--", "--", "--", "--", "--", "--", "--", "--"], pts: 0, dif: "-153" },
    { pos: 37, number: 55, flag: "🇳🇬", driver: "Y6NJ", team: "Red Bull", r: ["OUT", "--", "--", "--", "--", "--", "--", "--", "--", "--", "--", "--", "--", "--", "--"], pts: 0, dif: "-153" },
    { pos: 38, number: 19, flag: "🇦🇹", driver: "Zenthix", team: "Williams", r: ["--", "--", "--", "--", "--", "OUT", "--", "--", "--", "--", "--", "--", "--", "--", "--"], pts: 0, dif: "-153" },
    { pos: 39, number: 89, flag: "🇦🇷", driver: "VGXEmi", team: "Force India", r: ["--", "--", "--", "--", "--", "--", "--", "--", "--", "--", "--", "--", "--", "--", "--"], pts: 0, dif: "-153" },
    { pos: 40, number: 14, flag: "🇦🇷", driver: "Zukini", team: "Toro Rosso", r: ["--", "--", "--", "--", "--", "--", "--", "--", "--", "--", "--", "--", "--", "--", "--"], pts: 0, dif: "-153" },
    { pos: 41, number: 28, flag: "🇹🇷", driver: "SkyFall", team: "Toro Rosso", r: ["--", "--", "--", "--", "--", "--", "--", "--", "--", "--", "--", "--", "--", "--", "--"], pts: 0, dif: "-153" },
    { pos: 42, number: 9, flag: "🇷🇺", driver: "Bartus", team: "Renault", r: ["--", "--", "--", "--", "--", "--", "--", "--", "--", "--", "--", "--", "--", "--", "--"], pts: 0, dif: "-153" },
    { pos: 43, number: 27, flag: "🇫🇷", driver: "Hpdypro27", team: "Red Bull", r: ["--", "--", "--", "--", "--", "--", "--", "--", "--", "--", "--", "--", "--", "--", "--"], pts: 0, dif: "-153" },
    { pos: 44, number: 68, flag: "🇪🇸", driver: "Galogb", team: "Lotus", r: ["--", "--", "--", "--", "--", "--", "--", "--", "--", "--", "--", "--", "--", "--", "--"], pts: 0, dif: "-153" }
];

const defaultSettings = {
    discordUrl: "https://discord.gg/NXFPWd6eg",
    xUrl: "https://x.com/F0RMULAF4CTOR",
    instagramUrl: "https://www.instagram.com/formulafactorchampionship",
    season: "01",
    rounds: "15",
    drivers: "44",
    liveMode: false,
    twitchChannel: "https://www.twitch.tv/driezzz12",
    liveTitle: "ESTAMOS EN DIRECTO",
    liveSubtitle: "Sigue la retransmisión oficial de la carrera en vivo por Twitch.",
    fantasyLocked: false,
    fantasyLockMessage: "Mercado de fichajes congelado por Gran Premio en curso.",
    fantasyFluctuationEnabled: true,
    fantasyVolatilityMultiplier: 1.0
};

// Global Fantasy State & Constants (Declared early for lifecycle safety)
const FANTASY_INITIAL_BUDGET = 75.0;
const FANTASY_LOCAL_STORAGE_KEY = "ffc_fantasy_team_v2";

const ffcFantasyState = {
    teamName: "Mi Escudería FFC",
    driver1: null,
    driver2: null,
    driver3: null,
    team: null,
    turboDriver: null,
    roundLineups: {},
    currentFilter: "all",
    searchQuery: "",
    sortBy: "price-desc",
    activeSubTab: "team"
};
window.ffcFantasyState = ffcFantasyState;

// Admin UI Selectors
const headerAdminBtn = document.getElementById("headerAdminBtn");
const adminBtn = document.getElementById("adminBtn");
const userOpenAdminPanelBtn = document.getElementById("userOpenAdminPanelBtn");
const userAdminShortcut = document.getElementById("userAdminShortcut");

const adminPanelOverlay = document.getElementById("adminPanelOverlay");
const adminPanelClose = document.getElementById("adminPanelClose");
const adminLogoutBtn = document.getElementById("adminLogoutBtn");
const adminTabButtons = document.querySelectorAll(".admin-tab-btn");
const adminTabPanes = document.querySelectorAll(".admin-tab-pane");

// Admin Quick Ops Bar Elements
const adminQuickNextRace = document.getElementById("adminQuickNextRace");
const adminQuickDriversCount = document.getElementById("adminQuickDriversCount");
const adminQuickVerifiedCount = document.getElementById("adminQuickVerifiedCount");
const adminQuickLiveStatus = document.getElementById("adminQuickLiveStatus");
const adminQuickFantasyStatus = document.getElementById("adminQuickFantasyStatus");

// Admin Tab Count Badges
const adminTabDriversBadge = document.getElementById("adminTabDriversBadge");
const adminTabVerifyBadge = document.getElementById("adminTabVerifyBadge");

// Admin Verification Tab Elements
const adminVerifyDriverSelect = document.getElementById("adminVerifyDriverSelect");
const adminGenerateCodeBtn = document.getElementById("adminGenerateCodeBtn");
const adminGenerateNotice = document.getElementById("adminGenerateNotice");
const adminCodeOutputBox = document.getElementById("adminCodeOutputBox");
const adminGeneratedDriverName = document.getElementById("adminGeneratedDriverName");
const adminGeneratedCodeDisplay = document.getElementById("adminGeneratedCodeDisplay");
const adminCopyCodeBtn = document.getElementById("adminCopyCodeBtn");
const adminSearchVerifyPilotInput = document.getElementById("adminSearchVerifyPilotInput");
const adminFilterVerifyStatus = document.getElementById("adminFilterVerifyStatus");
const adminVerifyTotalPilots = document.getElementById("adminVerifyTotalPilots");
const adminVerifyCountVerified = document.getElementById("adminVerifyCountVerified");
const adminVerifyCountActiveCodes = document.getElementById("adminVerifyCountActiveCodes");
const adminVerifyCountPending = document.getElementById("adminVerifyCountPending");
const adminVerifyTableBody = document.getElementById("adminVerifyTableBody");

// Next Race Target Elements
const nextRaceRoundEl = document.getElementById("nextRaceRound");
const nextRaceTitleEl = document.getElementById("nextRaceTitle");
const nextRaceLocationEl = document.getElementById("nextRaceLocation");
const nextRaceDateTextEl = document.getElementById("nextRaceDateText");

const nextRaceForm = document.getElementById("nextRaceForm");
const adminQuickGpPreset = document.getElementById("adminQuickGpPreset");
const adminRaceRound = document.getElementById("adminRaceRound");
const adminRaceTitle = document.getElementById("adminRaceTitle");
const adminRaceLocation = document.getElementById("adminRaceLocation");
const adminRaceDateText = document.getElementById("adminRaceDateText");
const adminQuickTbdDateTextBtn = document.getElementById("adminQuickTbdDateTextBtn");
const adminRaceTemp = document.getElementById("adminRaceTemp");
const adminRaceWeather = document.getElementById("adminRaceWeather");
const adminRaceDateTime = document.getElementById("adminRaceDateTime");
const adminRaceIsTbd = document.getElementById("adminRaceIsTbd");
const adminSetTbdQuickBtn = document.getElementById("adminSetTbdQuickBtn");
const adminRaceDateTimeHint = document.getElementById("adminRaceDateTimeHint");
const adminQuickTbdResultsDateBtn = document.getElementById("adminQuickTbdResultsDateBtn");
const raceSaveNotice = document.getElementById("raceSaveNotice");

// Live Preview Replica Elements
const previewMockRound = document.getElementById("previewMockRound");
const previewMockTitle = document.getElementById("previewMockTitle");
const previewMockLocation = document.getElementById("previewMockLocation");
const previewMockDateText = document.getElementById("previewMockDateText");
const previewMockWeatherIcon = document.getElementById("previewMockWeatherIcon");
const previewMockWeatherTemp = document.getElementById("previewMockWeatherTemp");

// Standings Target Elements
const standingsTableBody = document.getElementById("standingsTableBody");
const constructorsTableBody = document.getElementById("constructorsTableBody");
const driverRankingBoard = document.getElementById("driverRankingBoard");
const driverLeaderRow = document.getElementById("driverLeaderRow");
const driverPodiumSplit = document.getElementById("driverPodiumSplit");
const driverRowsList = document.getElementById("driverRowsList");
const teamRankingBoard = document.getElementById("teamRankingBoard");
const teamLeaderRow = document.getElementById("teamLeaderRow");
const teamPodiumSplit = document.getElementById("teamPodiumSplit");
const teamRowsList = document.getElementById("teamRowsList");
const adminStandingsTableBody = document.getElementById("adminStandingsTableBody");
const adminStandingsSearchInput = document.getElementById("adminStandingsSearchInput");
const adminAddDriverBtn = document.getElementById("adminAddDriverBtn");
const adminRecalcStandingsBtn = document.getElementById("adminRecalcStandingsBtn");
const adminSaveStandingsBtn = document.getElementById("adminSaveStandingsBtn");
const standingsSaveNotice = document.getElementById("standingsSaveNotice");

// Settings Elements
const generalSettingsForm = document.getElementById("generalSettingsForm");
const adminLiveMode = document.getElementById("adminLiveMode");
const adminTwitchChannel = document.getElementById("adminTwitchChannel");
const adminLiveTitle = document.getElementById("adminLiveTitle");
const adminLiveRaceTitle = document.getElementById("adminLiveRaceTitle");
const adminLiveSubtitle = document.getElementById("adminLiveSubtitle");
const adminSwitchStatusText = document.getElementById("adminSwitchStatusText");
const adminFantasyLocked = document.getElementById("adminFantasyLocked");
const adminFantasyLockStatusText = document.getElementById("adminFantasyLockStatusText");
const adminFantasyLockMessage = document.getElementById("adminFantasyLockMessage");
const adminFantasyFluctuation = document.getElementById("adminFantasyFluctuation");
const adminFantasyFluctuationStatusText = document.getElementById("adminFantasyFluctuationStatusText");
const adminFantasyVolatility = document.getElementById("adminFantasyVolatility");
const adminRecalculatePricesBtn = document.getElementById("adminRecalculatePricesBtn");
const adminMarketSentimentWidget = document.getElementById("adminMarketSentimentWidget");
const adminDiscordUrl = document.getElementById("adminDiscordUrl");
const adminXUrl = document.getElementById("adminXUrl");
const adminInstagramUrl = document.getElementById("adminInstagramUrl");
const adminStatSeason = document.getElementById("adminStatSeason");
const adminStatRounds = document.getElementById("adminStatRounds");
const adminStatDrivers = document.getElementById("adminStatDrivers");
const statSeasonEl = document.getElementById("statSeason");
const statRoundsEl = document.getElementById("statRounds");
const statDriversEl = document.getElementById("statDrivers");
const settingsSaveNotice = document.getElementById("settingsSaveNotice");
const adminResetDefaultBtn = document.getElementById("adminResetDefaultBtn");

// Drivers Tab Admin Elements
const adminNewPilotForm = document.getElementById("adminNewPilotForm");
const newPilotName = document.getElementById("newPilotName");
const newPilotTeam = document.getElementById("newPilotTeam");
const adminAddNewPilotBtn = document.getElementById("adminAddNewPilotBtn");
const adminPilotTotalCount = document.getElementById("adminPilotTotalCount");
const adminSearchPilotInput = document.getElementById("adminSearchPilotInput");
const adminFilterTeamSelect = document.getElementById("adminFilterTeamSelect");
const adminDriversTableBody = document.getElementById("adminDriversTableBody");
const driversSaveNotice = document.getElementById("driversSaveNotice");
const adminSaveDriversBtn = document.getElementById("adminSaveDriversBtn");

// Race Results Target & Admin Elements
const raceResultsForm = document.getElementById("raceResultsForm");
const adminSelectRace = document.getElementById("adminSelectRace");
const adminRaceStatusBar = document.getElementById("adminRaceStatusBar");
const adminRaceStatusBadge = document.getElementById("adminRaceStatusBadge");
const adminRaceStatusSelect = document.getElementById("adminRaceStatusSelect");
const adminSetAsNextRaceBtn = document.getElementById("adminSetAsNextRaceBtn");
const adminToggleRaceStatusBtn = document.getElementById("adminToggleRaceStatusBtn");
const adminToggleRaceStatusBtnLabel = document.getElementById("adminToggleRaceStatusBtnLabel");
const adminFastestDriver = document.getElementById("adminFastestDriver");
const adminFastestTime = document.getElementById("adminFastestTime");
const adminPoleDriver = document.getElementById("adminPoleDriver");
const adminPoleTime = document.getElementById("adminPoleTime");
const adminDriverDay = document.getElementById("adminDriverDay");
const adminRaceDateInput = document.getElementById("adminRaceDateInput");
const adminRaceReplayUrl = document.getElementById("adminRaceReplayUrl");
const adminRacePositionsTable = document.getElementById("adminRacePositionsTable");
const adminRacePositionsBody = document.getElementById("adminRacePositionsBody");
const adminAddRacePosBtn = document.getElementById("adminAddRacePosBtn");
const adminLoadDefaultPosBtn = document.getElementById("adminLoadDefaultPosBtn");
const adminResetRaceBtn = document.getElementById("adminResetRaceBtn");
const adminResetRaceBtnBottom = document.getElementById("adminResetRaceBtnBottom");
const raceResultsSaveNotice = document.getElementById("raceResultsSaveNotice");
const toggleStandingsBtn = document.getElementById("toggleStandingsBtn");
const standingsToggleLabel = document.getElementById("standingsToggleLabel");

const F1_TEAMS = [
    "HRT",
    "Red Bull",
    "Ferrari",
    "Mercedes",
    "Toro Rosso",
    "Sauber",
    "Lotus",
    "Williams",
    "McLaren",
    "Virgin",
    "Renault",
    "Force India"
];

// Standings Expand State (Only Top 10 by default)
let isStandingsExpanded = false;

// Helper: Check Admin Authentication (Restricted to enzo.castillo.lomb@gmail.com)
function isAdminAuthenticated() {
    return isUserAdmin();
}

// Open and Close Admin Panel
function openAdminPanel() {
    if (!isUserAdmin()) {
        const u = typeof activeUserAuth !== "undefined" && activeUserAuth ? activeUserAuth : (typeof LocalAuthStore !== "undefined" ? LocalAuthStore.getCurrentUser() : null);
        if (!u || !u.email) {
            openUserAuthModal("login");
            showAuthAlert(
                currentLanguage === "en"
                    ? `Please log in with an administrator account to access the admin panel.`
                    : `Inicia sesión con una cuenta de administrador para acceder al panel.`
            );
        } else {
            alert(
                currentLanguage === "en"
                    ? `Access restricted: Only authorized administrator accounts have access.`
                    : `Acceso restringido: Solo las cuentas de administración autorizadas tienen acceso.`
            );
        }
        return;
    }

    if (!adminPanelOverlay) return;
    populateAdminForms();
    if (typeof updateAdminNewsBadge === "function") updateAdminNewsBadge();
    if (typeof renderAdminNewsTab === "function") renderAdminNewsTab();
    adminPanelOverlay.classList.add("active");
    document.body.classList.add("modal-open");
}

function closeAdminPanel() {
    if (!adminPanelOverlay) return;
    adminPanelOverlay.classList.remove("active");
    document.body.classList.remove("modal-open");
}

// --- Next Race Logic ---
function getSavedNextRace() {
    if (currentNextRace && currentNextRace.round) {
        return currentNextRace;
    }
    return defaultNextRace;
}

function renderNextRaceOnPage(race) {
    if (!race) race = defaultNextRace;

    if (nextRaceRoundEl) nextRaceRoundEl.textContent = race.round;
    if (nextRaceTitleEl) {
        if (race.title && race.title.includes(" GP")) {
            nextRaceTitleEl.innerHTML = `${race.title.replace(" GP", "")}<br>GP`;
        } else {
            nextRaceTitleEl.textContent = race.title || "";
        }
    }
    if (nextRaceLocationEl) {
        nextRaceLocationEl.textContent = race.location || "";
    }

    // Render Weather Widget
    const weatherIconEl = document.getElementById("nextRaceWeatherIcon");
    const weatherTempEl = document.getElementById("nextRaceWeatherTemp");
    const weatherCondEl = document.getElementById("nextRaceWeatherCond");
    const weatherPillEl = document.getElementById("nextRaceWeatherPill");

    const weatherCond = race.weatherCondition || "sunny";
    let rawTemp = race.weatherTemp || "22°C";
    if (rawTemp && !rawTemp.includes("°")) {
        rawTemp = `${rawTemp.trim()}°C`;
    }

    let icon = "☀️";
    let condLabel = "SOLEADO";
    let themeClass = "weather-sunny";

    const isEn = typeof currentLanguage !== "undefined" && currentLanguage === "en";

    const weatherKickerEl = document.getElementById("weatherLabelKicker");
    if (weatherKickerEl) {
        weatherKickerEl.textContent = isEn ? "RACE WEATHER FORECAST:" : "EL TIEMPO PARA LA CARRERA:";
    }

    if (weatherCond === "sunny") {
        icon = "☀️";
        condLabel = isEn ? "SUNNY" : "SOLEADO";
        themeClass = "weather-sunny";
    } else if (weatherCond === "partly-cloudy") {
        icon = "⛅";
        condLabel = isEn ? "PARTLY CLOUDY" : "PARCIALMENTE NUBLADO";
        themeClass = "weather-partly-cloudy";
    } else if (weatherCond === "cloudy") {
        icon = "☁️";
        condLabel = isEn ? "CLOUDY" : "NUBLADO";
        themeClass = "weather-cloudy";
    } else if (weatherCond === "rainy") {
        icon = "🌧️";
        condLabel = isEn ? "WET / RAIN" : "LLUVIA / PISTA MOJADA";
        themeClass = "weather-rainy";
    } else if (weatherCond === "storm") {
        icon = "🌩️";
        condLabel = isEn ? "HEAVY STORM" : "TORMENTA INTENSA";
        themeClass = "weather-storm";
    }

    if (weatherIconEl) weatherIconEl.textContent = icon;
    if (weatherTempEl) weatherTempEl.textContent = rawTemp;
    if (weatherCondEl) weatherCondEl.textContent = condLabel;
    if (weatherPillEl) {
        weatherPillEl.className = `next-race-weather-pill ${themeClass}`;
    }

    // Check if the race date is TBD / To Be Determined
    const isTbd = isNextRaceTbd(race);

    if (isTbd) {
        raceDate = null;
        if (nextRaceDateTextEl) {
            const rawText = race.dateText ? race.dateText.trim() : "";
            if (rawText && !["20 SEP · 16:30 CEST", "20 SEP · 16:30"].includes(rawText)) {
                nextRaceDateTextEl.innerHTML = `<span style="color:var(--gold-light, #f1d78a); font-weight:700;">TBD</span> <span>${escapeHtml(rawText.replace(/^TBD\s*[·–-]?\s*/i, "")) || (isEn ? "TO BE DETERMINED" : "POR DETERMINAR")}</span>`;
            } else {
                nextRaceDateTextEl.innerHTML = `<span style="color:var(--gold-light, #f1d78a); font-weight:700;">TBD</span> <span>${isEn ? "TO BE CONFIRMED" : "POR DETERMINAR"}</span>`;
            }
        }
        const rstLabel = document.getElementById("raceStartTimeLabel");
        if (rstLabel) {
            rstLabel.textContent = isEn ? "SCHEDULE STATUS" : "ESTADO DE FECHA";
        }
        updateCountdown();

        // Update race feature card in Races section
        const rfDay = document.getElementById("raceFeatureDay");
        const rfMonth = document.getElementById("raceFeatureMonth");
        const rfTime = document.getElementById("raceFeatureTime");
        const rfTitle = document.getElementById("raceFeatureTitle");
        const rfLocation = document.getElementById("raceFeatureLocation");
        const rfRoundNum = document.getElementById("raceFeatureRoundNum");

        if (rfDay) rfDay.textContent = "TBD";
        if (rfMonth) rfMonth.textContent = "TBA";
        if (rfTime) rfTime.textContent = isEn ? "TO BE DETERMINED" : "POR DETERMINAR";
        if (rfTitle && race.title) rfTitle.textContent = race.title;
        if (rfLocation && race.location) rfLocation.textContent = race.location;
        if (rfRoundNum && race.round) {
            const cleanRound = race.round.replace(/ROUND\s*/i, "").trim();
            rfRoundNum.textContent = cleanRound || race.round;
        }
    } else {
        const raceDateTime = race.dateTime || "2026-09-20T16:30";
        const converted = formatRaceForTimezone(raceDateTime, selectedTimezone, currentLanguage);

        if (converted) {
            if (nextRaceDateTextEl) {
                nextRaceDateTextEl.innerHTML = converted.dateTextCard;
            }
            raceDate = converted.epochMs;
            updateCountdown();

            const rstLabel = document.getElementById("raceStartTimeLabel");
            if (rstLabel) {
                const curLangDict = translations[currentLanguage] || translations.es;
                rstLabel.textContent = curLangDict.nextRace?.raceStartTime || (isEn ? "START TIME" : "HORA DE INICIO");
            }

            // Update race feature card in Races section
            const rfDay = document.getElementById("raceFeatureDay");
            const rfMonth = document.getElementById("raceFeatureMonth");
            const rfTime = document.getElementById("raceFeatureTime");
            const rfTitle = document.getElementById("raceFeatureTitle");
            const rfLocation = document.getElementById("raceFeatureLocation");
            const rfRoundNum = document.getElementById("raceFeatureRoundNum");

            if (rfDay) rfDay.textContent = converted.day;
            if (rfMonth) rfMonth.textContent = converted.month;
            if (rfTime) rfTime.textContent = `${converted.time} ${converted.tzName}`;
            if (rfTitle && race.title) rfTitle.textContent = race.title;
            if (rfLocation && race.location) rfLocation.textContent = race.location;
            if (rfRoundNum && race.round) {
                const cleanRound = race.round.replace(/ROUND\s*/i, "").trim();
                rfRoundNum.textContent = cleanRound || race.round;
            }
        } else if (nextRaceDateTextEl) {
            if (race.dateText && race.dateText.includes(" CEST")) {
                nextRaceDateTextEl.innerHTML = `${race.dateText.replace(" CEST", "")} <span>CEST</span>`;
            } else {
                nextRaceDateTextEl.textContent = race.dateText || "";
            }
        }
    }

    // Update timezone dropdown options preview
    renderTimezoneOptions();
}

// --- Standings Logic ---
function getSavedStandings() {
    if (currentPilotos && currentPilotos.length > 0) {
        return currentPilotos;
    }
    const base = defaultStandings.map(d => ({ ...d }));
    if (typeof window !== "undefined" && window.globalVerifiedUsersMap && window.globalVerifiedUsersMap.size > 0) {
        base.forEach(p => {
            const norm = normalizeDriverKey(p.driver);
            if (window.globalVerifiedUsersMap.has(norm)) {
                const uInfo = window.globalVerifiedUsersMap.get(norm);
                p.isVerified = true;
                p.claimedByEmail = uInfo.email || null;
                p.claimedByUid = uInfo.uid || null;
            }
        });
    }
    return base;
}

const officialDriverOrder = {
    "dieguiosk": 1,
    "muntii": 2,
    "novitaa": 3,
    "bigtheo": 4,
    "suforr": 5,
    "ivanr": 6,
    "sbinn": 7,
    "licha": 8,
    "theweregh": 9,
    "victor": 10,
    "gold": 11,
    "viktolo": 12,
    "farlonso": 13,
    "amf": 14,
    "elmamut": 15,
    "baena": 16,
    "sir galactic": 17,
    "diegosniper69": 18,
    "erik brenna": 19,
    "carlosure": 20,
    "dericcc": 21,
    "lil": 22,
    "kri": 23,
    "novi": 24,
    "daidaiiro": 25,
    "nando_fa14": 26,
    "krisdemurr": 27,
    "rafale": 28,
    "theagus60": 29,
    "j-dot": 30,
    "n. duro": 31,
    "tucnakcze": 32,
    "elnano": 33,
    "oscar soria": 34,
    "rikidorsa": 35,
    "drips": 36,
    "y6nj": 37,
    "zenthix": 38,
    "vgxemi": 39,
    "zukini": 40,
    "skyfall": 41,
    "bartus": 42,
    "hpdypro27": 43,
    "galogb": 44
};

function getPersistentDriverFlag(driverName) {
    if (!driverName) return null;
    const clean = driverName.trim().toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
    try {
        const raw = localStorage.getItem("ffc_custom_driver_flags");
        if (raw) {
            const parsed = JSON.parse(raw);
            if (parsed && typeof parsed === "object" && parsed[clean]) {
                return parsed[clean];
            }
        }
    } catch (e) {}
    return null;
}

function savePersistentDriverFlag(driverName, flag) {
    if (!driverName || !flag) return;
    const clean = driverName.trim().toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
    try {
        const raw = localStorage.getItem("ffc_custom_driver_flags");
        const parsed = raw ? (JSON.parse(raw) || {}) : {};
        parsed[clean] = flag;
        localStorage.setItem("ffc_custom_driver_flags", JSON.stringify(parsed));
    } catch (e) {}

    // Synchronize in-memory ffc2010SeasonDrivers
    if (typeof ffc2010SeasonDrivers !== "undefined" && Array.isArray(ffc2010SeasonDrivers)) {
        const found = ffc2010SeasonDrivers.find(d => 
            d.driver && d.driver.trim().toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "") === clean
        );
        if (found) found.flag = flag;
    }

    // Synchronize in-memory currentPilotos
    if (typeof currentPilotos !== "undefined" && Array.isArray(currentPilotos)) {
        const found = currentPilotos.find(d => 
            d.driver && d.driver.trim().toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "") === clean
        );
        if (found) {
            found.flag = flag;
            found.customFlag = flag;
        }
    }
}

function getOfficialDriverFlag(driverName) {
    if (!driverName) return "🏁";
    const clean = driverName.trim().toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");

    // 1. Check in-memory currentPilotos from Firestore
    if (typeof currentPilotos !== "undefined" && Array.isArray(currentPilotos) && currentPilotos.length > 0) {
        const found = currentPilotos.find(d => 
            d.driver && d.driver.trim().toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "") === clean
        );
        if (found && (found.flag || found.customFlag)) return found.flag || found.customFlag;
    }

    // 2. Check persistent user-saved flags from localStorage
    const cachedFlag = getPersistentDriverFlag(driverName);
    if (cachedFlag) return cachedFlag;

    // 3. User-defined official defaults
    if (clean === "dieguiosk") return "🇦🇱";
    if (clean === "ivanr") return "🇲🇦";

    // 4. Fallback to ffc2010SeasonDrivers
    if (typeof ffc2010SeasonDrivers !== "undefined" && Array.isArray(ffc2010SeasonDrivers)) {
        const found = ffc2010SeasonDrivers.find(d => 
            d.driver && d.driver.trim().toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "") === clean
        );
        if (found && found.flag) return found.flag;
    }
    return "🏁";
}

const OFFICIAL_COUNTRY_FLAGS = [
    { name: "España", flag: "🇪🇸" },
    { name: "Argentina", flag: "🇦🇷" },
    { name: "México", flag: "🇲🇽" },
    { name: "Chile", flag: "🇨🇱" },
    { name: "Colombia", flag: "🇨🇴" },
    { name: "Perú", flag: "🇵🇪" },
    { name: "Uruguay", flag: "🇺🇾" },
    { name: "Venezuela", flag: "🇻🇪" },
    { name: "Portugal", flag: "🇵🇹" },
    { name: "Reino Unido", flag: "🇬🇧" },
    { name: "Escocia", flag: "🏴󠁧󠁢󠁳󠁣󠁴󠁿" },
    { name: "Francia", flag: "🇫🇷" },
    { name: "Alemania", flag: "🇩🇪" },
    { name: "Italia", flag: "🇮🇹" },
    { name: "Países Bajos", flag: "🇳🇱" },
    { name: "Mónaco", flag: "🇲🇨" },
    { name: "Australia", flag: "🇦🇺" },
    { name: "Brasil", flag: "🇧🇷" },
    { name: "Estados Unidos", flag: "🇺🇸" },
    { name: "Canadá", flag: "🇨🇦" },
    { name: "Japón", flag: "🇯🇵" },
    { name: "Suiza", flag: "🇨🇭" },
    { name: "Austria", flag: "🇦🇹" },
    { name: "Bélgica", flag: "🇧🇪" },
    { name: "Finlandia", flag: "🇫🇮" },
    { name: "Dinamarca", flag: "🇩🇰" },
    { name: "Polonia", flag: "🇵🇱" },
    
    // América (resto)
    { name: "Bolivia", flag: "🇧🇴" },
    { name: "Costa Rica", flag: "🇨🇷" },
    { name: "Cuba", flag: "🇨🇺" },
    { name: "Ecuador", flag: "🇪🇨" },
    { name: "El Salvador", flag: "🇸🇻" },
    { name: "Guatemala", flag: "🇬🇹" },
    { name: "Honduras", flag: "🇭🇳" },
    { name: "Nicaragua", flag: "🇳🇮" },
    { name: "Panamá", flag: "🇵🇦" },
    { name: "Paraguay", flag: "🇵🇾" },
    { name: "Puerto Rico", flag: "🇵🇷" },
    { name: "República Dominicana", flag: "🇩🇴" },
    { name: "Jamaica", flag: "🇯🇲" },
    { name: "Bahamas", flag: "🇧🇸" },
    { name: "Haití", flag: "🇭🇹" },
    { name: "Trinidad y Tobago", flag: "🇹🇹" },
    { name: "Barbados", flag: "🇧🇧" },
    { name: "Belice", flag: "🇧🇿" },
    { name: "Guayana", flag: "🇬🇾" },
    { name: "Surinam", flag: "🇸🇷" },

    // Europa (resto)
    { name: "Albania", flag: "🇦🇱" },
    { name: "Andorra", flag: "🇦🇩" },
    { name: "Armenia", flag: "🇦🇲" },
    { name: "Azerbaiyán", flag: "🇦🇿" },
    { name: "Bielorrusia", flag: "🇧🇾" },
    { name: "Bosnia y Herzegovina", flag: "🇧🇦" },
    { name: "Bulgaria", flag: "🇧🇬" },
    { name: "Chipre", flag: "🇨🇾" },
    { name: "Croacia", flag: "🇭🇷" },
    { name: "República Checa", flag: "🇨🇿" },
    { name: "Unión Europea", flag: "🇪🇺" },
    { name: "Eslovaquia", flag: "🇸🇰" },
    { name: "Eslovenia", flag: "🇸🇮" },
    { name: "Estonia", flag: "🇪🇪" },
    { name: "Georgia", flag: "🇬🇪" },
    { name: "Grecia", flag: "🇬🇷" },
    { name: "Hungría", flag: "🇭🇺" },
    { name: "Irlanda", flag: "🇮🇪" },
    { name: "Islandia", flag: "🇮🇸" },
    { name: "Letonia", flag: "🇱🇻" },
    { name: "Liechtenstein", flag: "🇱🇮" },
    { name: "Lituania", flag: "🇱🇹" },
    { name: "Luxemburgo", flag: "🇱🇺" },
    { name: "Macedonia del Norte", flag: "🇲🇰" },
    { name: "Malta", flag: "🇲🇹" },
    { name: "Moldavia", flag: "🇲🇩" },
    { name: "Montenegro", flag: "🇲🇪" },
    { name: "Noruega", flag: "🇳🇴" },
    { name: "Rumania", flag: "🇷🇴" },
    { name: "Rusia", flag: "🇷🇺" },
    { name: "San Marino", flag: "🇸🇲" },
    { name: "Serbia", flag: "🇷🇸" },
    { name: "Suecia", flag: "🇸🇪" },
    { name: "Ucrania", flag: "🇺🇦" },
    { name: "Vaticano", flag: "🇻🇦" },
    { name: "Inglaterra", flag: "🏴󠁧󠁢󠁥󠁮󠁧󠁿" },
    { name: "Gales", flag: "🏴󠁧󠁢󠁷󠁬󠁳󠁿" },

    // Asia (resto)
    { name: "Afganistán", flag: "🇦🇫" },
    { name: "Arabia Saudita", flag: "🇸🇦" },
    { name: "Baréin", flag: "🇧🇭" },
    { name: "Bangladés", flag: "🇧🇩" },
    { name: "Brunéi", flag: "🇧🇳" },
    { name: "Bután", flag: "🇧🇹" },
    { name: "Camboya", flag: "🇰🇭" },
    { name: "Catar", flag: "🇶🇦" },
    { name: "China", flag: "🇨🇳" },
    { name: "Corea del Norte", flag: "🇰🇵" },
    { name: "Corea del Sur", flag: "🇰🇷" },
    { name: "Emiratos Árabes Unidos", flag: "🇦🇪" },
    { name: "Filipinas", flag: "🇵🇭" },
    { name: "India", flag: "🇮🇳" },
    { name: "Indonesia", flag: "🇮🇩" },
    { name: "Irak", flag: "🇮🇶" },
    { name: "Irán", flag: "🇮🇷" },
    { name: "Israel", flag: "🇮🇱" },
    { name: "Jordania", flag: "🇯🇴" },
    { name: "Kazajistán", flag: "🇰🇿" },
    { name: "Kirguistán", flag: "🇰🇬" },
    { name: "Kuwait", flag: "🇰🇼" },
    { name: "Laos", flag: "🇱🇦" },
    { name: "Líbano", flag: "🇱🇧" },
    { name: "Malasia", flag: "🇲🇾" },
    { name: "Maldivas", flag: "🇲🇻" },
    { name: "Mongolia", flag: "🇲🇳" },
    { name: "Birmania", flag: "🇲🇲" },
    { name: "Nepal", flag: "🇳🇵" },
    { name: "Omán", flag: "🇴🇲" },
    { name: "Pakistán", flag: "🇵🇰" },
    { name: "Palestina", flag: "🇵🇸" },
    { name: "Singapur", flag: "🇸🇬" },
    { name: "Siria", flag: "🇸🇾" },
    { name: "Sri Lanka", flag: "🇱🇰" },
    { name: "Tailandia", flag: "🇹🇭" },
    { name: "Taiwán", flag: "🇹🇼" },
    { name: "Tayikistán", flag: "🇹🇯" },
    { name: "Timor Oriental", flag: "🇹🇱" },
    { name: "Turkmenistán", flag: "🇹🇲" },
    { name: "Turquía", flag: "🇹🇷" },
    { name: "Uzbekistán", flag: "🇺🇿" },
    { name: "Vietnam", flag: "🇻🇳" },
    { name: "Yemen", flag: "🇾🇪" },

    // África
    { name: "Angola", flag: "🇦🇴" },
    { name: "Argelia", flag: "🇩🇿" },
    { name: "Benín", flag: "🇧🇯" },
    { name: "Botsuana", flag: "🇧🇼" },
    { name: "Burkina Faso", flag: "🇧🇫" },
    { name: "Burundi", flag: "🇧🇮" },
    { name: "Cabo Verde", flag: "🇨🇻" },
    { name: "Camerún", flag: "🇨🇲" },
    { name: "República Centroafricana", flag: "🇨🇫" },
    { name: "Chad", flag: "🇹🇩" },
    { name: "Comoras", flag: "🇰🇲" },
    { name: "Congo", flag: "🇨🇬" },
    { name: "República Democrática del Congo", flag: "🇨🇩" },
    { name: "Costa de Marfil", flag: "🇨🇮" },
    { name: "Egipto", flag: "🇪🇬" },
    { name: "Eritrea", flag: "🇪🇷" },
    { name: "Esuatini", flag: "🇸🇿" },
    { name: "Etiopía", flag: "🇪🇹" },
    { name: "Gabón", flag: "🇬🇦" },
    { name: "Gambia", flag: "🇬🇲" },
    { name: "Ghana", flag: "🇬🇭" },
    { name: "Guinea", flag: "🇬🇳" },
    { name: "Guinea-Bisáu", flag: "🇬🇼" },
    { name: "Guinea Ecuatorial", flag: "🇬🇶" },
    { name: "Kenia", flag: "🇰🇪" },
    { name: "Lesoto", flag: "🇱🇸" },
    { name: "Liberia", flag: "🇱🇷" },
    { name: "Libia", flag: "🇱🇾" },
    { name: "Madagascar", flag: "🇲🇬" },
    { name: "Malaui", flag: "🇲🇼" },
    { name: "Malí", flag: "🇲🇱" },
    { name: "Marruecos", flag: "🇲🇦" },
    { name: "Mauricio", flag: "🇲🇺" },
    { name: "Mauritania", flag: "🇲🇷" },
    { name: "Mozambique", flag: "🇲🇿" },
    { name: "Namibia", flag: "🇳🇦" },
    { name: "Níger", flag: "🇳🇪" },
    { name: "Nigeria", flag: "🇳🇬" },
    { name: "Ruanda", flag: "🇷🇼" },
    { name: "Santo Tomé y Príncipe", flag: "🇸🇹" },
    { name: "Senegal", flag: "🇸🇳" },
    { name: "Seychelles", flag: "🇸🇨" },
    { name: "Sierra Leona", flag: "🇸🇱" },
    { name: "Somalia", flag: "🇸🇴" },
    { name: "Sudáfrica", flag: "🇿🇦" },
    { name: "Sudán", flag: "🇸🇩" },
    { name: "Sudán del Sur", flag: "🇸🇸" },
    { name: "Tanzania", flag: "🇹🇿" },
    { name: "Togo", flag: "🇹🇬" },
    { name: "Túnez", flag: "🇹🇳" },
    { name: "Uganda", flag: "🇺🇬" },
    { name: "Yibuti", flag: "🇩🇯" },
    { name: "Zambia", flag: "🇿🇲" },
    { name: "Zimbabue", flag: "🇿🇼" },

    // Oceanía
    { name: "Fiyi", flag: "🇫🇯" },
    { name: "Islas Marshall", flag: "🇲🇭" },
    { name: "Islas Salomón", flag: "🇸🇧" },
    { name: "Kiribati", flag: "🇰🇮" },
    { name: "Micronesia", flag: "🇫🇲" },
    { name: "Nauru", flag: "🇳🇷" },
    { name: "Nueva Zelanda", flag: "🇳🇿" },
    { name: "Palaos", flag: "🇵🇼" },
    { name: "Papúa Nueva Guinea", flag: "🇵🇬" },
    { name: "Samoa", flag: "🇼🇸" },
    { name: "Tonga", flag: "🇹🇴" },
    { name: "Tuvalu", flag: "🇹🇻" },
    { name: "Vanuatu", flag: "🇻🇺" },

    { name: "Sin Bandera / Genérico", flag: "🏁" }
];

function getCountryCodeFromEmoji(emoji) {
    if (!emoji || emoji === "🏁" || emoji === "🏭") return null;
    
    let cleanEmoji = String(emoji).trim();
    if (cleanEmoji.includes("🏴󠁧󠁢󠁳󠁣󠁴󠁿")) return "gb-sct";
    if (cleanEmoji.includes("🏴󠁧󠁢󠁥󠁮󠁧󠁿")) return "gb-eng";
    if (cleanEmoji.includes("🏴󠁧󠁢󠁷󠁬󠁳󠁿")) return "gb-wls";
    if (cleanEmoji.includes("🇪🇺")) return "eu";

    // Extract regional indicator letters
    const matched = cleanEmoji.match(/[\uD83C][\uDDE6-\uDDFF][\uD83C][\uDDE6-\uDDFF]/);
    if (matched) {
        cleanEmoji = matched[0];
    } else {
        const chars = [...cleanEmoji];
        if (chars.length >= 2) {
            for (let i = 0; i < chars.length - 1; i++) {
                const code1 = chars[i].codePointAt(0);
                const code2 = chars[i+1].codePointAt(0);
                if (code1 >= 127462 && code1 <= 127487 && code2 >= 127462 && code2 <= 127487) {
                    cleanEmoji = chars[i] + chars[i+1];
                    break;
                }
            }
        }
    }

    const chars = [...cleanEmoji];
    if (chars.length !== 2) return null;
    const code = chars.map(c => {
        const cp = c.codePointAt(0);
        return String.fromCharCode(cp - 127397);
    }).join('').toLowerCase();
    return code.length === 2 ? code : null;
}

function getFlagHtml(flagEmoji, size = 18) {
    if (!flagEmoji) return `<span class="driver-flag-emoji" style="display: inline-block; vertical-align: middle;">🏁</span>`;
    const code = getCountryCodeFromEmoji(flagEmoji);
    if (code) {
        return `<img src="https://flagcdn.com/w40/${code}.png" class="driver-flag-img inline-block align-middle" alt="${code}" style="width: ${size}px; height: auto; max-height: ${Math.round(size * 0.85)}px; border-radius: 2px; box-shadow: 0 1px 3px rgba(0,0,0,0.35); display: inline-block; vertical-align: middle; margin-top: -2px; margin-right: 4px;" onerror="this.outerHTML='<span class=\\'driver-flag-emoji\\'>${flagEmoji}</span>'">`;
    }
    return `<span class="driver-flag-emoji" style="display: inline-block; vertical-align: middle;">${flagEmoji}</span>`;
}

function getDriverFlagHtml(driverName, size = 18) {
    const flagEmoji = (typeof getOfficialDriverFlag === "function") ? getOfficialDriverFlag(driverName) : "🏁";
    return getFlagHtml(flagEmoji, size);
}

const COUNTRY_NAMES_BY_FLAG = {
    "🇪🇸": "España",
    "🇵🇹": "Portugal",
    "🇦🇷": "Argentina",
    "🇨🇴": "Colombia",
    "🇧🇷": "Brasil",
    "🇨🇭": "Suiza",
    "🏴󠁧󠁢󠁳󠁣󠁴󠁿": "Escocia",
    "🇬🇧": "Reino Unido",
    "🇧🇬": "Bulgaria",
    "🇯🇵": "Japón",
    "🇮🇹": "Italia",
    "🇨🇿": "República Checa",
    "🇳🇬": "Nigeria",
    "🇦🇹": "Austria",
    "🇹🇷": "Turquía",
    "🇷🇺": "Rusia",
    "🇫🇷": "Francia",
    "🇲🇽": "México",
    "🇨🇱": "Chile",
    "🇺🇾": "Uruguay",
    "🇵🇪": "Perú",
    "🇺🇸": "Estados Unidos",
    "🇩🇪": "Alemania",
    "🏁": "Internacional / FFC"
};

function getCountryNameByFlag(flag) {
    if (!flag) return "Internacional / FFC";
    if (COUNTRY_NAMES_BY_FLAG[flag]) return COUNTRY_NAMES_BY_FLAG[flag];
    const found = OFFICIAL_COUNTRY_FLAGS.find(c => c.flag === flag);
    return found ? found.name : "Oficial FIA / FFC";
}

function extractFlagFromCountryString(str) {
    if (!str) return "🏁";
    const trimmed = str.trim();

    // Check custom/regional long flags first
    if (trimmed.includes("🏴󠁧󠁢󠁳󠁣󠁴󠁿") || trimmed.startsWith("🏴󠁧󠁢󠁳󠁣󠁴󠁿")) return "🏴󠁧󠁢󠁳󠁣󠁴󠁿";
    if (trimmed.includes("🏴󠁧󠁢󠁥󠁮󠁧󠁿") || trimmed.startsWith("🏴󠁧󠁢󠁥󠁮󠁧󠁿")) return "🏴󠁧󠁢󠁥󠁮󠁧󠁿";
    if (trimmed.includes("🏴󠁧󠁢󠁷󠁬󠁳󠁿") || trimmed.startsWith("🏴󠁧󠁢󠁷󠁬󠁳󠁿")) return "🏴󠁧󠁢󠁷󠁬󠁳󠁿";
    if (trimmed.includes("🇪🇺") || trimmed.startsWith("🇪🇺")) return "🇪🇺";

    // Scan for known flag emojis or names in OFFICIAL_COUNTRY_FLAGS
    if (typeof OFFICIAL_COUNTRY_FLAGS !== "undefined" && Array.isArray(OFFICIAL_COUNTRY_FLAGS)) {
        for (const c of OFFICIAL_COUNTRY_FLAGS) {
            if (trimmed.includes(c.flag)) return c.flag;
            if (trimmed.toLowerCase() === c.name.toLowerCase()) return c.flag;
        }
    }

    // Match 2-character regional indicators for country flags at start or anywhere
    const regMatch = trimmed.match(/^[\u{1F1E6}-\u{1F1FF}]{2}/u);
    if (regMatch) return regMatch[0];
    const regMatchAny = trimmed.match(/[\u{1F1E6}-\u{1F1FF}]{2}/u);
    if (regMatchAny) return regMatchAny[0];

    // Safely extract the first full unicode character (including emojis) using Array.from
    const chars = Array.from(trimmed);
    if (chars.length > 0) {
        return chars[0];
    }

    return "🏁";
}

function initAllCountriesDatalist() {
    let datalist = document.getElementById("allCountriesDatalist");
    if (!datalist) {
        datalist = document.createElement("datalist");
        datalist.id = "allCountriesDatalist";
        document.body.appendChild(datalist);
    }
    datalist.innerHTML = OFFICIAL_COUNTRY_FLAGS.map(c => 
        `<option value="${c.flag} ${c.name}">${c.flag} ${c.name}</option>`
    ).join("");
}

function getOfficialDriverRank(driverName) {
    if (!driverName) return 999;
    const clean = driverName.trim().toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
    if (officialDriverOrder[clean] !== undefined) {
        return officialDriverOrder[clean];
    }
    if (typeof ffc2010SeasonDrivers !== "undefined") {
        const found = ffc2010SeasonDrivers.find(d => 
            d.driver.trim().toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "") === clean
        );
        if (found) return found.pos;
    }
    return 999;
}

function sortDriversStandings(drivers) {
    return [...drivers].sort((a, b) => {
        const ptsDiff = (Number(b.pts) || 0) - (Number(a.pts) || 0);
        if (ptsDiff !== 0) return ptsDiff;
        const aRank = a.pos || getOfficialDriverRank(a.driver);
        const bRank = b.pos || getOfficialDriverRank(b.driver);
        return aRank - bRank;
    });
}

function renderStandingsOnPage(drivers) {
    // Sort by points descending with official championship tie-breaker ranking
    const sorted = sortDriversStandings(drivers);
    const isEn = typeof currentLanguage !== "undefined" && currentLanguage === "en";
    const leaderBadgeText = isEn ? "LEADER" : "LÍDER";
    const trophySvg = `
        <svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor" class="leader-trophy-icon" aria-hidden="true">
            <path d="M19 5h-2V3H7v2H5c-1.1 0-2 .9-2 2v1c0 2.55 1.92 4.63 4.39 4.94A5.01 5.01 0 0 0 11 15.9V19H8v2h8v-2h-3v-3.1c1.84-.36 3.28-1.78 3.61-3.96C19.08 11.63 21 9.55 21 8V7c0-1.1-.9-2-2-2zM5 8V7h2v3.82C5.84 10.4 5 9.3 5 8zm14 0c0 1.3-.84 2.4-2 2.82V7h2v1z"/>
        </svg>
    `;

    const leaderPts = sorted[0] ? Number(sorted[0].pts) : 0;
    const tiedLeaders = sorted.filter(d => Number(d.pts) === leaderPts && leaderPts > 0);
    const isLeaderTied = tiedLeaders.length > 1;

    if (isLeaderTied) {
        // Tied P1 Hero Row: Empate badge top-center, Left: "1." + Driver 1, Center: Points, Right: Driver 2
        if (driverLeaderRow) {
            driverLeaderRow.classList.add("is-tied");
            driverLeaderRow.classList.remove("driver-card-clickable");
            driverLeaderRow.removeAttribute("data-driver");
            const d1 = tiedLeaders[0];
            const d2 = tiedLeaders[1];
            const tieBadgeText = isEn ? "TIE" : "EMPATE";
            driverLeaderRow.innerHTML = `
                <div class="ranking-tied-badge">
                    <span>${tieBadgeText}</span>
                </div>
                <div class="ranking-tied-left">
                    <span class="ranking-leader-pos">1.</span>
                    <div class="ranking-tied-team">
                        <span class="ranking-leader-name driver-clickable" data-driver="${escapeHtml(d1.driver)}" title="Ver estadísticas de ${escapeHtml(d1.driver)}">${escapeHtml(d1.driver)}</span>
                        <span class="ranking-team-pill ${getTeamClass(d1.team)} team-clickable" data-team="${escapeHtml(d1.team)}" title="Ver equipo ${escapeHtml(d1.team)}"><span class="team-dot"></span>${escapeHtml(d1.team)}</span>
                    </div>
                </div>
                <div class="ranking-tied-center">
                    <div class="ranking-pts-tag ranking-tied-pts">
                        <strong class="pts-num">${Number(d1.pts)}</strong>
                        <small class="pts-label">PTS</small>
                    </div>
                </div>
                <div class="ranking-tied-right">
                    <div class="ranking-tied-team">
                        <span class="ranking-leader-name driver-clickable" data-driver="${escapeHtml(d2 ? d2.driver : '')}" title="Ver estadísticas de ${escapeHtml(d2 ? d2.driver : '')}">${escapeHtml(d2 ? d2.driver : '')}</span>
                        <span class="ranking-team-pill ${getTeamClass(d2 ? d2.team : '')} team-clickable" data-team="${escapeHtml(d2 ? d2.team : '')}" title="Ver equipo ${escapeHtml(d2 ? d2.team : '')}"><span class="team-dot"></span>${escapeHtml(d2 ? d2.team : '')}</span>
                    </div>
                </div>
            `;
        }

        // Hide P2 & P3 podium split when P1 is tied
        if (driverPodiumSplit) {
            driverPodiumSplit.style.display = "none";
        }

        // Start rows list directly from tiedLeaders.length (position 3 if 2 tied)
        if (driverRowsList) {
            driverRowsList.innerHTML = "";
            for (let idx = tiedLeaders.length; idx < sorted.length; idx++) {
                const d = sorted[idx];
                const rowDiv = document.createElement("div");
                rowDiv.className = "ranking-row driver-row-clickable";
                rowDiv.setAttribute("data-driver", d.driver);
                rowDiv.setAttribute("title", `Ver estadísticas de ${d.driver}`);
                if (idx >= 12) {
                    if (!isStandingsExpanded) {
                        rowDiv.classList.add("standings-row-hidden");
                    } else {
                        rowDiv.classList.add("standings-row-revealed");
                        const delayStep = Math.min(idx - 12, 25);
                        rowDiv.style.setProperty("--row-delay", `${delayStep * 15}ms`);
                    }
                }
                rowDiv.innerHTML = `
                    <span class="ranking-row-pos">${idx + 1}</span>
                    <span class="ranking-row-name driver-clickable" data-driver="${escapeHtml(d.driver)}">${escapeHtml(d.driver)}</span>
                    <span class="ranking-team-cell"><span class="ranking-team-pill ${getTeamClass(d.team)} team-clickable" data-team="${escapeHtml(d.team)}" title="Ver equipo ${escapeHtml(d.team)}"><span class="team-dot"></span>${escapeHtml(d.team)}</span></span>
                    <span class="ranking-row-pts">${Number(d.pts)}</span>
                `;
                driverRowsList.appendChild(rowDiv);
            }
        }
    } else {
        // Standard Single Leader Flow
        if (driverLeaderRow) {
            driverLeaderRow.classList.remove("is-tied");
            driverLeaderRow.classList.add("driver-card-clickable");
            if (sorted[0]) {
                const d1 = sorted[0];
                driverLeaderRow.setAttribute("data-driver", d1.driver);
                driverLeaderRow.setAttribute("title", `Ver estadísticas de ${d1.driver}`);
                if (d1.cardColor) {
                    driverLeaderRow.style.borderColor = `${d1.cardColor}90`;
                } else {
                    driverLeaderRow.style.borderColor = "";
                }
                const d1Avatar = (d1.avatarUrl && d1.avatarUrl.trim()) ? `<img src="${escapeHtml(d1.avatarUrl.trim())}" class="ranking-leader-avatar" alt="${escapeHtml(d1.driver)}" onerror="this.style.display='none'">` : "";
                const d1FlagHtml = getDriverFlagHtml(d1.driver, 20);
                const d1TeamClass = getTeamClass(d1.team);

                driverLeaderRow.innerHTML = `
                    <div class="ranking-leader-left">
                        <span class="ranking-leader-pos">1.</span>
                        ${d1Avatar}
                        <div class="ranking-leader-info">
                            <span class="ranking-leader-name driver-clickable" data-driver="${escapeHtml(d1.driver)}">${d1FlagHtml}${escapeHtml(d1.driver)}</span>
                            <div class="ranking-leader-meta">
                                <span class="ranking-team-flat ${d1TeamClass} team-clickable" data-team="${escapeHtml(d1.team)}" title="Ver equipo ${escapeHtml(d1.team)}">${escapeHtml(d1.team)}</span>
                            </div>
                        </div>
                    </div>
                    <div class="ranking-leader-right">
                        <div class="ranking-pts-tag">
                            <strong class="pts-num">${Number(d1.pts)}</strong>
                            <small class="pts-label">PTS</small>
                        </div>
                        <div class="leader-badge-pill" id="driverLeaderBadge">
                            <span class="leader-badge-text">${leaderBadgeText}</span>
                            ${trophySvg}
                        </div>
                    </div>
                `;
            }
        }

        // 2. Render P2 & P3 Split Columns
        if (driverPodiumSplit) {
            driverPodiumSplit.style.display = "";
            const d2 = sorted[1];
            const d3 = sorted[2];
            let p2Html = "";
            let p3Html = "";

            if (d2) {
                const d2Avatar = (d2.avatarUrl && d2.avatarUrl.trim()) ? `<img src="${escapeHtml(d2.avatarUrl.trim())}" class="ranking-driver-avatar" alt="${escapeHtml(d2.driver)}" onerror="this.style.display='none'">` : "";
                const d2FlagHtml = getDriverFlagHtml(d2.driver, 18);
                const d2TeamClass = getTeamClass(d2.team);
                const d2Border = d2.cardColor ? `style="border-color: ${d2.cardColor}80;"` : "";

                p2Html = `
                    <div class="ranking-podium-col ranking-p2 driver-card-clickable" id="driverP2Col" data-driver="${escapeHtml(d2.driver)}" title="Ver estadísticas de ${escapeHtml(d2.driver)}" ${d2Border}>
                        <div class="ranking-podium-left">
                            <span class="ranking-podium-pos">2.</span>
                            ${d2Avatar}
                            <div class="ranking-podium-info">
                                <span class="ranking-podium-name driver-clickable" data-driver="${escapeHtml(d2.driver)}">${d2FlagHtml}${escapeHtml(d2.driver)}</span>
                                <div class="ranking-podium-meta">
                                    <span class="ranking-team-flat ${d2TeamClass} team-clickable" data-team="${escapeHtml(d2.team)}" title="Ver equipo ${escapeHtml(d2.team)}">${escapeHtml(d2.team)}</span>
                                </div>
                            </div>
                        </div>
                        <div class="ranking-podium-right">
                            <div class="ranking-pts-tag">
                                <strong class="pts-num">${Number(d2.pts)}</strong>
                                <small class="pts-label">PTS</small>
                            </div>
                        </div>
                    </div>
                `;
            }

            if (d3) {
                const d3Avatar = (d3.avatarUrl && d3.avatarUrl.trim()) ? `<img src="${escapeHtml(d3.avatarUrl.trim())}" class="ranking-driver-avatar" alt="${escapeHtml(d3.driver)}" onerror="this.style.display='none'">` : "";
                const d3FlagHtml = getDriverFlagHtml(d3.driver, 18);
                const d3TeamClass = getTeamClass(d3.team);
                const d3Border = d3.cardColor ? `style="border-color: ${d3.cardColor}80;"` : "";

                p3Html = `
                    <div class="ranking-podium-col ranking-p3 driver-card-clickable" id="driverP3Col" data-driver="${escapeHtml(d3.driver)}" title="Ver estadísticas de ${escapeHtml(d3.driver)}" ${d3Border}>
                        <div class="ranking-podium-left">
                            <span class="ranking-podium-pos">3.</span>
                            ${d3Avatar}
                            <div class="ranking-podium-info">
                                <span class="ranking-podium-name driver-clickable" data-driver="${escapeHtml(d3.driver)}">${d3FlagHtml}${escapeHtml(d3.driver)}</span>
                                <div class="ranking-podium-meta">
                                    <span class="ranking-team-flat ${d3TeamClass} team-clickable" data-team="${escapeHtml(d3.team)}" title="Ver equipo ${escapeHtml(d3.team)}">${escapeHtml(d3.team)}</span>
                                </div>
                            </div>
                        </div>
                        <div class="ranking-podium-right">
                            <div class="ranking-pts-tag">
                                <strong class="pts-num">${Number(d3.pts)}</strong>
                                <small class="pts-label">PTS</small>
                            </div>
                        </div>
                    </div>
                `;
            }

            driverPodiumSplit.innerHTML = p2Html + p3Html;
        }

        // 3. Render P4+ Rows List
        if (driverRowsList) {
            driverRowsList.innerHTML = "";
            for (let idx = 3; idx < sorted.length; idx++) {
                const d = sorted[idx];
                const rowDiv = document.createElement("div");
                rowDiv.className = "ranking-row driver-row-clickable";
                rowDiv.setAttribute("data-driver", d.driver);
                rowDiv.setAttribute("title", `Ver estadísticas de ${d.driver}`);
                if (idx >= 12) {
                    if (!isStandingsExpanded) {
                        rowDiv.classList.add("standings-row-hidden");
                    } else {
                        rowDiv.classList.add("standings-row-revealed");
                        const delayStep = Math.min(idx - 12, 25);
                        rowDiv.style.setProperty("--row-delay", `${delayStep * 15}ms`);
                    }
                }
                const teamClass = getTeamClass(d.team);
                const flagHtml = getDriverFlagHtml(d.driver, 18);

                rowDiv.innerHTML = `
                    <div class="team-color-strip ${teamClass}"></div>
                    <span class="ranking-row-pos">${idx + 1}</span>
                    <span class="ranking-row-name driver-clickable" data-driver="${escapeHtml(d.driver)}">${flagHtml}<span>${escapeHtml(d.driver)}</span></span>
                    <span class="ranking-team-cell"><span class="ranking-team-flat ${teamClass} team-clickable" data-team="${escapeHtml(d.team)}" title="Ver equipo ${escapeHtml(d.team)}">${escapeHtml(d.team)}</span></span>
                    <span class="ranking-row-pts">${Number(d.pts)}</span>
                `;
                driverRowsList.appendChild(rowDiv);
            }
        }
    }

    // Fallback if legacy standingsTableBody is present
    if (standingsTableBody) {
        standingsTableBody.innerHTML = "";
        sorted.forEach((d, idx) => {
            const tr = document.createElement("tr");
            if (idx === 0) tr.classList.add("leader");
            if (idx >= 12) {
                if (!isStandingsExpanded) {
                    tr.classList.add("standings-row-hidden");
                } else {
                    tr.classList.add("standings-row-revealed");
                    const delayStep = Math.min(idx - 12, 25);
                    tr.style.setProperty("--row-delay", `${delayStep * 15}ms`);
                }
            }
            tr.innerHTML = `
                <td>${idx + 1}</td>
                <td><span class="driver-clickable" data-driver="${escapeHtml(d.driver)}">${escapeHtml(d.driver)}</span></td>
                <td class="${getTeamClass(d.team)}">${escapeHtml(d.team)}</td>
                <td>${Number(d.pts)}</td>
            `;
            standingsTableBody.appendChild(tr);
        });
    }

    updateStandingsToggleUI(sorted.length);
    updateConstructorStandings(sorted);
    renderFfcMatrixTable();
}

// ==============================================
// OFFICIAL FFC 2010 SEASON MATRIX & STATS ENGINE
// ==============================================

const FFC_SEASON_GPS = [
    { r: 1, flag: "🇦🇺", code: "AUS", name: "Australia", raceKey: "australia" },
    { r: 2, flag: "🇲🇾", code: "MAL", name: "Malasia", raceKey: "malaysia" },
    { r: 3, flag: "🇧🇭", code: "BAH", name: "Bahréin", raceKey: "bahrain" },
    { r: 4, flag: "🇹🇷", code: "TUR", name: "Turquía", raceKey: "turkey" },
    { r: 5, flag: "🇪🇸", code: "ESP", name: "España", raceKey: "spain" },
    { r: 6, flag: "🇮🇹", code: "ITA", name: "Italia", raceKey: "italy" },
    { r: 7, flag: "🇦🇹", code: "AUT", name: "Austria", raceKey: "austria" },
    { r: 8, flag: "🇬🇧", code: "GBR", name: "Gran Bretaña", raceKey: "silverstone" },
    { r: 9, flag: "🇩🇪", code: "GER", name: "Alemania", raceKey: "hockenheim" },
    { r: 10, flag: "🇪🇺", code: "EUR", name: "Europa", raceKey: "nurburgring" },
    { r: 11, flag: "🇭🇺", code: "HUN", name: "Hungría", raceKey: "hungary" },
    { r: 12, flag: "🇧🇪", code: "BEL", name: "Bélgica", raceKey: "belgium" },
    { r: 13, flag: "🇸🇬", code: "SIN", name: "Singapur", raceKey: "singapore" },
    { r: 14, flag: "🇺🇸", code: "USA", name: "Estados Unidos", raceKey: "cota" },
    { r: 15, flag: "🇧🇷", code: "BRA", name: "Brasil", raceKey: "brazil" }
];

function getDynamicSeasonMatrixData() {
    const rawStandings = (currentPilotos && currentPilotos.length > 0) ? currentPilotos : getSavedStandings();
    const sorted = sortDriversStandings(rawStandings);

    // Build metadata dictionary (dorsal number, flag, team)
    const metaMap = new Map();
    if (typeof ffc2010SeasonDrivers !== "undefined" && Array.isArray(ffc2010SeasonDrivers)) {
        ffc2010SeasonDrivers.forEach(d => {
            if (d && d.driver) {
                const k = normalizeDriverKey(d.driver);
                metaMap.set(k, {
                    number: d.number,
                    flag: d.flag,
                    team: d.team
                });
            }
        });
    }

    const leaderPts = sorted.length > 0 ? (Number(sorted[0].pts) || 0) : 0;

    return sorted.map((driverObj, idx) => {
        const driverName = driverObj.driver;
        const normKey = normalizeDriverKey(driverName);
        const meta = metaMap.get(normKey) || {};
        const team = driverObj.team || meta.team || getDriverTeam(driverName) || "Independent";
        const pts = Number(driverObj.pts) || 0;
        const pos = idx + 1;
        const dif = pos === 1 ? "--" : `-${Math.max(0, leaderPts - pts)}`;

        // Calculate 15 race cells dynamically from raceResults
        const rounds = FFC_SEASON_GPS.map(gp => {
            const race = raceResults[gp.raceKey];
            if (!race || !Array.isArray(race.drivers) || race.drivers.length === 0) {
                return "--";
            }
            const isCompleted = race.status === "COMPLETED" || (race.winner && race.winner !== "TBA");
            if (!isCompleted) {
                return "--";
            }

            const driverEntry = race.drivers.find(d => d && d.driver && normalizeDriverKey(d.driver) === normKey);
            if (!driverEntry) {
                return "--";
            }

            if (driverEntry.status === "DNF") {
                return "OUT";
            }
            if (driverEntry.status === "DSQ") {
                return "DSQ";
            }

            const racePos = Number(driverEntry.pos) || 0;
            const basePts = F1_POINTS_MAP[racePos] || 0;

            // Check Fastest Lap (+1 pt bonus)
            let isFL = false;
            if (race.fastest && race.fastest !== "TBA") {
                const flName = race.fastest.split("·")[0].trim();
                if (flName && normalizeDriverKey(flName) === normKey) {
                    isFL = true;
                }
            }

            // Check Pole Position (circled)
            let isPole = false;
            if (race.pole && race.pole !== "TBA") {
                const poleName = race.pole.split("·")[0].trim();
                if (poleName && normalizeDriverKey(poleName) === normKey) {
                    isPole = true;
                }
            }

            const totalRoundPts = basePts + (isFL ? F1_FASTEST_LAP_PTS : 0);

            if (isPole) {
                return isFL ? `(${totalRoundPts}*)` : `(${totalRoundPts})`;
            } else if (isFL) {
                return `${totalRoundPts}*`;
            } else {
                return `${totalRoundPts}`;
            }
        });

        const officialFlag = driverObj.flag || driverObj.customFlag || getOfficialDriverFlag(driverName) || meta.flag || "🏁";

        return {
            pos,
            id: driverObj.id || null,
            number: meta.number || pos,
            flag: officialFlag,
            driver: driverName,
            team,
            r: rounds,
            pts,
            dif,
            avatarUrl: driverObj.avatarUrl || null,
            cardColor: driverObj.cardColor || null,
            customFlag: driverObj.customFlag || driverObj.flag || officialFlag,
            bio: driverObj.bio || null,
            socialTwitch: driverObj.socialTwitch || null,
            socialYoutube: driverObj.socialYoutube || null,
            socialTwitter: driverObj.socialTwitter || null,
            socialDiscord: driverObj.socialDiscord || null,
            isVerified: !!driverObj.isVerified
        };
    });
}

// --- Official FFC 2010 Season Matrix Spreadsheet Renderer ---
function renderFfcMatrixTable(filterText = "") {
    const tbody = document.getElementById("ffcMatrixTableBody");
    if (!tbody) return;

    const dynamicDrivers = getDynamicSeasonMatrixData();
    const searchInput = document.getElementById("matrixSearchInput");
    const query = (filterText !== "" ? filterText : (searchInput ? searchInput.value : "")).trim().toLowerCase();

    const rows = dynamicDrivers.filter(d => {
        if (!query) return true;
        return d.driver.toLowerCase().includes(query) || (d.team && d.team.toLowerCase().includes(query));
    });

    tbody.innerHTML = "";
    rows.forEach((row) => {
        const tr = document.createElement("tr");

        // Pos Pill class
        let posContent = `${row.pos}`;
        if (row.pos === 1) {
            posContent = `<span class="pos-pill-1">1</span>`;
        } else if (row.pos === 2) {
            posContent = `<span class="pos-pill-2">2</span>`;
        } else if (row.pos === 3) {
            posContent = `<span class="pos-pill-3">3</span>`;
        }

        // Driver cell
        const driverContent = `
            <div class="driver-cell-content driver-clickable" data-driver="${escapeHtml(row.driver)}" title="Ver estadísticas de ${escapeHtml(row.driver)}">
                <span class="driver-number-badge ${getTeamClass(row.team)}">${row.number || ""}</span>
                <span class="driver-flag-emoji">${getFlagHtml(row.flag || getOfficialDriverFlag(row.driver), 18)}</span>
                <span class="driver-name-text">${escapeHtml(row.driver)}</span>
            </div>
        `;

        // Render 15 race cells
        let raceCellsHtml = "";
        for (let i = 0; i < 15; i++) {
            const rawVal = row.r[i] !== undefined ? String(row.r[i]) : "--";
            let formattedVal = "";

            if (rawVal.startsWith("(") && rawVal.endsWith(")")) {
                // Pole Position: circled e.g. (18) or (26*)
                const inner = rawVal.slice(1, -1);
                const hasFL = inner.includes("*");
                const cleanScore = inner.replace("*", "");
                formattedVal = `<span class="score-pole ${hasFL ? 'score-fl' : ''}">${cleanScore}</span>`;
            } else if (rawVal.endsWith("*")) {
                // Fastest Lap (+1 bonus point) e.g. 13*
                const cleanScore = rawVal.replace("*", "");
                formattedVal = `<span class="score-cell score-fl">${cleanScore}*</span>`;
            } else if (rawVal === "25") {
                formattedVal = `<span class="score-cell score-win">25</span>`;
            } else if (rawVal === "OUT") {
                formattedVal = `<span class="score-out">OUT</span>`;
            } else if (rawVal === "DSQ") {
                formattedVal = `<span class="score-dsq">DSQ</span>`;
            } else if (rawVal === "0") {
                formattedVal = `<span class="score-cell score-zero">0</span>`;
            } else if (rawVal === "--") {
                formattedVal = `<span class="score-cell score-none">--</span>`;
            } else {
                formattedVal = `<span class="score-cell">${escapeHtml(rawVal)}</span>`;
            }

            raceCellsHtml += `<td>${formattedVal}</td>`;
        }

        tr.innerHTML = `
            <td class="col-pos">${posContent}</td>
            <td class="col-driver">${driverContent}</td>
            <td class="col-team ${getTeamClass(row.team)} team-clickable" data-team="${escapeHtml(row.team)}" title="Ver equipo ${escapeHtml(row.team)}">${escapeHtml(row.team)}</td>
            ${raceCellsHtml}
            <td class="col-points">${row.pts}</td>
            <td class="col-dif">${row.dif}</td>
        `;
        tbody.appendChild(tr);
    });
}

function initStandingsViewTabs() {
    const tabMatrix = document.getElementById("tabStandingsMatrix");
    const tabCards = document.getElementById("tabStandingsCards");
    const viewMatrix = document.getElementById("standingsMatrixView");
    const viewCards = document.getElementById("standingsCardsView");

    if (tabMatrix && tabCards && viewMatrix && viewCards) {
        tabMatrix.addEventListener("click", () => {
            tabMatrix.classList.add("active");
            tabCards.classList.remove("active");
            viewMatrix.style.display = "block";
            viewCards.style.display = "none";
            renderFfcMatrixTable();
        });

        tabCards.addEventListener("click", () => {
            tabCards.classList.add("active");
            tabMatrix.classList.remove("active");
            viewMatrix.style.display = "none";
            viewCards.style.display = "block";
        });
    }

    const searchInput = document.getElementById("matrixSearchInput");
    if (searchInput) {
        searchInput.addEventListener("input", (e) => {
            renderFfcMatrixTable(e.target.value);
        });
    }
}

// ==============================================
// MINI TARJETA DE ESTADÍSTICAS DE PILOTO (MODAL)
// ==============================================
let currentOpenModalDriver = null;

function findDriverStats(driverName) {
    if (!driverName) return null;
    const clean = normalizeDriverKey(driverName);
    const dynamicData = getDynamicSeasonMatrixData();
    const match = dynamicData.find(d => normalizeDriverKey(d.driver) === clean);
    if (!match) return null;

    // Parse rounds breakdown
    let wins = 0;
    let podiums = 0;
    let poles = 0;
    let fastestLaps = 0;
    let races = 0;
    let dnfs = 0;

    if (Array.isArray(match.r)) {
        match.r.forEach(val => {
            if (!val || val === "--") return;
            races++;
            if (val === "OUT") {
                dnfs++;
                return;
            }
            if (val === "DSQ") {
                return;
            }
            if (val.includes("(") && val.includes(")")) poles++;
            if (val.includes("*")) fastestLaps++;

            const numStr = val.replace(/[\(\)\*]/g, "");
            const pts = parseInt(numStr, 10) || 0;
            if (pts >= 25) {
                wins++;
                podiums++;
            } else if (pts >= 15) {
                podiums++;
            }
        });
    }

    const pilotDoc = (currentPilotos || []).find(p => normalizeDriverKey(p.driver) === clean) || {};
    const isUserClaimed = activeUserData && activeUserData.claimedDriver && normalizeDriverKey(activeUserData.claimedDriver) === clean;
    const userCustom = isUserClaimed ? activeUserData : {};

    const cardColor = userCustom.cardColor || pilotDoc.cardColor || match.cardColor || null;
    const avatarUrl = userCustom.avatarUrl !== undefined ? userCustom.avatarUrl : (pilotDoc.avatarUrl || match.avatarUrl || null);
    const officialFlag = match.flag || getOfficialDriverFlag(match.driver) || "🏁";
    const bio = userCustom.bio !== undefined ? userCustom.bio : (pilotDoc.bio || match.bio || null);
    const socialTwitch = userCustom.socialTwitch !== undefined ? userCustom.socialTwitch : (pilotDoc.socialTwitch || match.socialTwitch || null);
    const socialYoutube = userCustom.socialYoutube !== undefined ? userCustom.socialYoutube : (pilotDoc.socialYoutube || match.socialYoutube || null);
    const socialTwitter = userCustom.socialTwitter !== undefined ? userCustom.socialTwitter : (pilotDoc.socialTwitter || match.socialTwitter || null);
    const socialDiscord = userCustom.socialDiscord !== undefined ? userCustom.socialDiscord : (pilotDoc.socialDiscord || match.socialDiscord || null);
    const isVerified = userCustom.isVerified !== undefined ? !!userCustom.isVerified : (pilotDoc.isVerified !== undefined ? !!pilotDoc.isVerified : !!match.isVerified);

    return {
        driver: match.driver,
        team: match.team,
        pos: match.pos,
        pts: match.pts,
        number: match.number,
        flag: officialFlag,
        dif: match.dif,
        rounds: match.r,
        avatarUrl,
        cardColor,
        customFlag: null,
        bio,
        socialTwitch,
        socialYoutube,
        socialTwitter,
        socialDiscord,
        isVerified,
        stats: {
            wins,
            podiums,
            poles,
            fastestLaps,
            races,
            dnfs
        }
    };
}

function openDriverStatsModal(driverName) {
    const data = findDriverStats(driverName);
    if (!data) return;

    currentOpenModalDriver = data.driver;
    const overlay = document.getElementById("driverModalOverlay");
    if (!overlay) return;

    const isEn = typeof currentLanguage !== "undefined" && currentLanguage === "en";

    // Team styling class
    const teamCls = getTeamClass(data.team);

    // Custom Card Color Accent & Border
    const cardEl = document.getElementById("driverModalCard");
    const strip = document.getElementById("driverModalStrip");
    if (strip) {
        strip.className = `driver-modal-strip ${teamCls}`;
        if (data.cardColor) {
            strip.style.backgroundColor = data.cardColor;
            strip.style.boxShadow = `0 0 20px ${data.cardColor}`;
        } else {
            strip.style.backgroundColor = "";
            strip.style.boxShadow = "";
        }
    }
    if (cardEl) {
        if (data.cardColor) {
            cardEl.style.borderColor = data.cardColor;
            cardEl.style.boxShadow = `0 25px 70px rgba(0, 0, 0, 0.85), 0 0 30px ${data.cardColor}40`;
        } else {
            cardEl.style.borderColor = "";
            cardEl.style.boxShadow = "";
        }
    }

    // Avatar / Profile Photo
    const avatarBox = document.getElementById("driverModalAvatarBox");
    const avatarImg = document.getElementById("driverModalAvatarImg");
    if (avatarBox && avatarImg) {
        if (data.avatarUrl && data.avatarUrl.trim()) {
            avatarImg.src = data.avatarUrl.trim();
            avatarBox.style.display = "block";
            if (data.cardColor) {
                avatarBox.style.borderColor = data.cardColor;
                avatarBox.style.boxShadow = `0 0 15px ${data.cardColor}60`;
            } else {
                avatarBox.style.borderColor = "var(--gold, #d6b45c)";
                avatarBox.style.boxShadow = "0 0 12px rgba(214, 180, 92, 0.3)";
            }
            avatarImg.onerror = () => {
                avatarBox.style.display = "none";
            };
            avatarImg.onload = () => {
                avatarBox.style.display = "block";
            };
        } else {
            avatarBox.style.display = "none";
            avatarImg.src = "";
        }
    }

    // Dorsal Number
    const dorsalEl = document.getElementById("driverModalDorsal");
    if (dorsalEl) {
        const dorsalVal = data.number ? `#${data.number}` : `#${data.pos}`;
        dorsalEl.textContent = dorsalVal;
        if (data.cardColor) {
            dorsalEl.style.borderColor = `${data.cardColor}80`;
            dorsalEl.style.color = data.cardColor;
            dorsalEl.style.background = `${data.cardColor}18`;
        } else {
            dorsalEl.style.borderColor = "";
            dorsalEl.style.color = "";
            dorsalEl.style.background = "";
        }
    }

    // Flag & Name
    const flagEl = document.getElementById("driverModalFlag");
    if (flagEl) flagEl.innerHTML = getFlagHtml(data.customFlag || data.flag || "🏁", 24);

    const nameEl = document.getElementById("driverModalName");
    if (nameEl) nameEl.textContent = data.driver;

    const verifiedBadge = document.getElementById("driverModalVerifiedBadge");
    if (verifiedBadge) {
        verifiedBadge.style.display = data.isVerified ? "inline-block" : "none";
    }

    // Bio / Description
    const bioBox = document.getElementById("driverModalBioBox");
    const bioText = document.getElementById("driverModalBioText");
    if (bioBox && bioText) {
        if (data.bio && data.bio.trim()) {
            bioText.textContent = data.bio.trim();
            bioBox.style.display = "block";
            if (data.cardColor) {
                bioBox.style.borderLeftColor = data.cardColor;
            } else {
                bioBox.style.borderLeftColor = "var(--gold, #d6b45c)";
            }
        } else {
            bioBox.style.display = "none";
            bioText.textContent = "";
        }
    }

    // Social Links
    const socialBox = document.getElementById("driverModalSocialBox");
    const socialGrid = document.getElementById("driverModalSocialGrid");
    if (socialBox && socialGrid) {
        socialGrid.innerHTML = "";
        let count = 0;

        if (data.socialTwitch && data.socialTwitch.trim()) {
            count++;
            const a = document.createElement("a");
            a.className = "social-pill social-pill-twitch";
            a.target = "_blank";
            a.rel = "noopener noreferrer";
            const userStr = data.socialTwitch.trim().replace("https://twitch.tv/", "").replace("https://www.twitch.tv/", "").replace("@", "");
            a.href = data.socialTwitch.startsWith("http") ? data.socialTwitch : `https://twitch.tv/${userStr}`;
            a.innerHTML = `👾 Twitch: ${userStr}`;
            if (data.cardColor) a.style.borderColor = `${data.cardColor}60`;
            socialGrid.appendChild(a);
        }

        if (data.socialYoutube && data.socialYoutube.trim()) {
            count++;
            const a = document.createElement("a");
            a.className = "social-pill social-pill-youtube";
            a.target = "_blank";
            a.rel = "noopener noreferrer";
            const ytStr = data.socialYoutube.trim().replace("https://youtube.com/", "").replace("https://www.youtube.com/", "");
            a.href = data.socialYoutube.startsWith("http") ? data.socialYoutube : `https://youtube.com/${ytStr}`;
            a.innerHTML = `📺 YouTube: ${ytStr}`;
            if (data.cardColor) a.style.borderColor = `${data.cardColor}60`;
            socialGrid.appendChild(a);
        }

        if (data.socialTwitter && data.socialTwitter.trim()) {
            count++;
            const a = document.createElement("a");
            a.className = "social-pill social-pill-twitter";
            a.target = "_blank";
            a.rel = "noopener noreferrer";
            const twStr = data.socialTwitter.trim().replace("https://x.com/", "").replace("https://twitter.com/", "").replace("@", "");
            a.href = data.socialTwitter.startsWith("http") ? data.socialTwitter : `https://x.com/${twStr}`;
            a.innerHTML = `🐦 @${twStr}`;
            if (data.cardColor) a.style.borderColor = `${data.cardColor}60`;
            socialGrid.appendChild(a);
        }

        if (data.socialDiscord && data.socialDiscord.trim()) {
            count++;
            const span = document.createElement("span");
            span.className = "social-pill social-pill-discord";
            span.innerHTML = `💬 Discord: ${data.socialDiscord.trim()}`;
            if (data.cardColor) span.style.borderColor = `${data.cardColor}60`;
            socialGrid.appendChild(span);
        }

        socialBox.style.display = count > 0 ? "block" : "none";
    }

    // Team Pill
    const teamEl = document.getElementById("driverModalTeam");
    if (teamEl) {
        teamEl.textContent = data.team;
        teamEl.className = `driver-modal-team-pill team-clickable ${teamCls}`;
        teamEl.setAttribute("data-team", data.team);
        teamEl.setAttribute("title", isEn ? `View ${data.team} stats` : `Ver estadísticas de ${data.team}`);
    }

    // Role / Championship badge
    const roleBadgeEl = document.getElementById("driverModalRoleBadge");
    if (roleBadgeEl) {
        if (data.pos === 1) {
            roleBadgeEl.textContent = isEn ? "CHAMPIONSHIP LEADER" : "LÍDER DEL CAMPEONATO";
        } else if (data.pos <= 3) {
            roleBadgeEl.textContent = isEn ? "PODIUM CONTENDER" : "PODIO DEL CAMPEONATO";
        } else if (data.pos <= 10) {
            roleBadgeEl.textContent = isEn ? "TOP 10 DRIVER" : "TOP 10 DEL CAMPEONATO";
        } else {
            roleBadgeEl.textContent = isEn ? "OFFICIAL FFC DRIVER" : "PILOTO OFICIAL FFC 2010";
        }
    }

    // KPIs
    const kpiPos = document.getElementById("driverKpiPos");
    if (kpiPos) kpiPos.textContent = `P${data.pos}`;

    const kpiPts = document.getElementById("driverKpiPts");
    if (kpiPts) kpiPts.textContent = `${data.pts}`;

    const kpiGap = document.getElementById("driverKpiGap");
    if (kpiGap) {
        if (data.pos === 1 || data.dif === "--" || data.dif === "0") {
            kpiGap.textContent = isEn ? "LEADER" : "LÍDER";
        } else {
            kpiGap.textContent = data.dif.startsWith("-") ? `${data.dif} PTS` : `-${data.dif} PTS`;
        }
    }

    const kpiWins = document.getElementById("driverKpiWins");
    if (kpiWins) kpiWins.textContent = `${data.stats.wins}`;

    const kpiPodiums = document.getElementById("driverKpiPodiums");
    if (kpiPodiums) kpiPodiums.textContent = `${data.stats.podiums}`;

    const kpiPoles = document.getElementById("driverKpiPoles");
    if (kpiPoles) kpiPoles.textContent = `${data.stats.poles}`;

    const kpiFastest = document.getElementById("driverKpiFastest");
    if (kpiFastest) kpiFastest.textContent = `${data.stats.fastestLaps}`;

    const kpiRaces = document.getElementById("driverKpiRaces");
    if (kpiRaces) kpiRaces.textContent = `${data.stats.races}`;

    // Bilingual Labels
    const lblPos = document.getElementById("lblKpiPos");
    if (lblPos) lblPos.textContent = isEn ? "POSITION" : "POSICIÓN";

    const lblPts = document.getElementById("lblKpiPts");
    if (lblPts) lblPts.textContent = isEn ? "POINTS" : "PUNTOS";

    const lblGap = document.getElementById("lblKpiGap");
    if (lblGap) lblGap.textContent = isEn ? "GAP" : "DIFERENCIA";

    const lblWins = document.getElementById("lblKpiWins");
    if (lblWins) lblWins.textContent = isEn ? "WINS" : "VICTORIAS";

    const lblPodiums = document.getElementById("lblKpiPodiums");
    if (lblPodiums) lblPodiums.textContent = isEn ? "PODIUMS" : "PODIOS";

    const lblPoles = document.getElementById("lblKpiPoles");
    if (lblPoles) lblPoles.textContent = isEn ? "POLES" : "POLES";

    const lblFastest = document.getElementById("lblKpiFastest");
    if (lblFastest) lblFastest.textContent = isEn ? "F. LAPS" : "V. RÁPIDAS";

    const lblRaces = document.getElementById("lblKpiRaces");
    if (lblRaces) lblRaces.textContent = isEn ? "RACES" : "CARRERAS";

    const lblRoundsTitle = document.getElementById("lblRoundsTitle");
    if (lblRoundsTitle) lblRoundsTitle.textContent = isEn ? "FFC 2010 SEASON (R1 - R15)" : "TRAYECTORIA FFC 2010 (R1 - R15)";

    const lblRoundsSub = document.getElementById("lblRoundsSub");
    if (lblRoundsSub) lblRoundsSub.textContent = isEn ? "ROUND-BY-ROUND RESULTS" : "RESULTADOS POR CARRERA";

    // Populate Rounds Grid
    const roundsGrid = document.getElementById("driverModalRoundsGrid");
    if (roundsGrid) {
        roundsGrid.innerHTML = "";
        FFC_SEASON_GPS.forEach((gp, idx) => {
            const rawVal = (data.rounds && data.rounds[idx]) ? data.rounds[idx] : "--";
            const card = document.createElement("div");
            card.className = "round-card-mini round-card-clickable";
            card.setAttribute("data-race", gp.raceKey);
            card.setAttribute("data-round", gp.r);
            card.setAttribute("role", "button");
            card.setAttribute("tabindex", "0");
            const gpTitle = isEn
                ? `Round ${gp.r} - ${gp.name} GP (Click to view race)`
                : `Ronda ${gp.r} - GP de ${gp.name} (Clic para ir a la carrera)`;
            card.setAttribute("title", gpTitle);
            card.setAttribute("aria-label", gpTitle);

            let pillClass = "res-none";
            let pillText = rawVal;
            const hasPole = rawVal.includes("(") && rawVal.includes(")");
            const hasFL = rawVal.includes("*");

            if (rawVal === "OUT") {
                pillClass = "res-out";
                pillText = "DNF";
            } else if (rawVal !== "--") {
                const numStr = rawVal.replace(/[\(\)\*]/g, "");
                const num = parseInt(numStr, 10) || 0;
                if (num >= 25) {
                    pillClass = "res-win";
                    pillText = `🏆 ${num}`;
                } else if (num >= 15) {
                    pillClass = "res-podium";
                    pillText = `${num}`;
                } else if (num > 0) {
                    pillClass = "res-pts";
                    pillText = `${num}`;
                } else {
                    pillClass = "res-none";
                    pillText = "0";
                }
            }

            let badgesHtml = "";
            if (hasPole) badgesHtml += `<span class="extra-badge badge-pole" title="Pole Position">P</span>`;
            if (hasFL) badgesHtml += `<span class="extra-badge badge-fl" title="Vuelta Rápida">FL</span>`;

            card.innerHTML = `
                <div class="round-card-mini-top">
                    <span class="round-card-mini-flag">${getFlagHtml(gp.flag, 16)}</span>
                    <span>R${gp.r}</span>
                </div>
                <div class="round-res-pill ${pillClass}">${pillText}</div>
                <div class="round-card-badges">${badgesHtml}</div>
            `;

            card.addEventListener("click", (e) => {
                e.preventDefault();
                e.stopPropagation();
                navigateToRace(gp.raceKey, data.driver);
            });

            card.addEventListener("keydown", (e) => {
                if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    e.stopPropagation();
                    navigateToRace(gp.raceKey, data.driver);
                }
            });

            roundsGrid.appendChild(card);
        });
    }

    overlay.classList.add("active");
    overlay.setAttribute("aria-hidden", "false");
    document.body.style.overflow = "hidden";
}

function closeDriverStatsModal() {
    currentOpenModalDriver = null;
    const overlay = document.getElementById("driverModalOverlay");
    if (!overlay) return;
    overlay.classList.remove("active");
    overlay.setAttribute("aria-hidden", "true");
    document.body.style.overflow = "";
}

function initDriverStatsModal() {
    const overlay = document.getElementById("driverModalOverlay");
    const closeBtn = document.getElementById("closeDriverModal");

    if (closeBtn) {
        closeBtn.addEventListener("click", (e) => {
            e.stopPropagation();
            closeDriverStatsModal();
        });
    }

    if (overlay) {
        overlay.addEventListener("click", (e) => {
            if (e.target === overlay) {
                closeDriverStatsModal();
            }
        });
    }

    document.addEventListener("keydown", (e) => {
        if (e.key === "Escape" && overlay && overlay.classList.contains("active")) {
            closeDriverStatsModal();
        }
    });

    // Delegated click handler on the entire document for any element with data-driver or round card
    document.addEventListener("click", (e) => {
        // Prevent opening driver card if click is within the admin panel, overlay, or admin tables
        if (e.target.closest("#adminPanelOverlay, .admin-panel-card, #adminDriversTableBody, .admin-table, .admin-panel, .admin-tab-pane, .admin-add-driver-card")) {
            return;
        }

        // Direct redirection if clicking a round card inside the modal
        const roundCard = e.target.closest(".round-card-mini, [data-race-round]");
        if (roundCard) {
            const raceKey = roundCard.getAttribute("data-race") || roundCard.getAttribute("data-race-round");
            if (raceKey) {
                e.preventDefault();
                e.stopPropagation();
                navigateToRace(raceKey, currentOpenModalDriver);
                return;
            }
        }

        // Check if user clicked a team-specific trigger first (which takes priority if explicitly clicked)
        const teamTrigger = e.target.closest(".team-clickable, [data-team]:not([data-driver])");
        if (teamTrigger) {
            const teamName = teamTrigger.getAttribute("data-team") || teamTrigger.textContent.trim();
            if (teamName && teamName !== "Independent" && teamName !== "TBA") {
                e.preventDefault();
                e.stopPropagation();
                if (typeof closeRaceModal === "function") {
                    closeRaceModal();
                }
                if (typeof closeDriverStatsModal === "function") {
                    closeDriverStatsModal();
                }
                openTeamStatsModal(teamName);
                return;
            }
        }

        // Prevent opening if clicking an interactive control like a button or input inside
        if (e.target.closest("button, input, select, a, textarea")) {
            const btn = e.target.closest("button, a");
            if (btn && !btn.hasAttribute("data-driver") && !btn.classList.contains("driver-clickable")) {
                return;
            }
        }

        const trigger = e.target.closest("[data-driver]");
        if (trigger) {
            const driverName = trigger.getAttribute("data-driver");
            if (driverName) {
                e.preventDefault();
                if (typeof closeRaceModal === "function") {
                    closeRaceModal();
                }
                if (typeof closeTeamStatsModal === "function") {
                    closeTeamStatsModal();
                }
                openDriverStatsModal(driverName);
            }
        }
    });
}

// ==============================================
// MINI TARJETA DE ESTADÍSTICAS DE EQUIPO (MODAL)
// ==============================================
const F1_TEAM_META = {
    "HRT": { fullName: "HRT F1 Team", code: "HRT", flag: "🇪🇸", country: "España", countryEn: "Spain" },
    "Red Bull": { fullName: "Red Bull Racing", code: "RBR", flag: "🇦🇹", country: "Austria", countryEn: "Austria" },
    "Ferrari": { fullName: "Scuderia Ferrari", code: "FER", flag: "🇮🇹", country: "Italia", countryEn: "Italy" },
    "Mercedes": { fullName: "Mercedes GP Petronas", code: "MER", flag: "🇩🇪", country: "Alemania", countryEn: "Germany" },
    "Toro Rosso": { fullName: "Scuderia Toro Rosso", code: "STR", flag: "🇮🇹", country: "Italia", countryEn: "Italy" },
    "Williams": { fullName: "AT&T Williams F1", code: "WIL", flag: "🇬🇧", country: "Reino Unido", countryEn: "United Kingdom" },
    "Sauber": { fullName: "BMW Sauber F1 Team", code: "SAU", flag: "🇨🇭", country: "Suiza", countryEn: "Switzerland" },
    "Lotus": { fullName: "Lotus Racing", code: "LOT", flag: "🇬🇧", country: "Reino Unido", countryEn: "United Kingdom" },
    "McLaren": { fullName: "Vodafone McLaren Mercedes", code: "MCL", flag: "🇬🇧", country: "Reino Unido", countryEn: "United Kingdom" },
    "Virgin": { fullName: "Virgin Racing", code: "VRG", flag: "🇬🇧", country: "Reino Unido", countryEn: "United Kingdom" },
    "Force India": { fullName: "Force India F1 Team", code: "FOR", flag: "🇮🇳", country: "India", countryEn: "India" },
    "Renault": { fullName: "Renault F1 Team", code: "REN", flag: "🇫🇷", country: "Francia", countryEn: "France" }
};

let currentOpenModalTeam = null;

function findTeamStats(teamName) {
    if (!teamName) return null;
    const clean = teamName.trim().toLowerCase();
    const matchedTeam = F1_TEAMS.find(t => t.toLowerCase() === clean) || teamName.trim();
    const meta = F1_TEAM_META[matchedTeam] || {
        fullName: matchedTeam,
        code: matchedTeam.slice(0, 3).toUpperCase(),
        flag: "🏁",
        country: "Competición",
        countryEn: "Racing"
    };

    // 1. Get Live Standings to compute team positions and points
    const rawStandings = (currentPilotos && currentPilotos.length > 0) ? currentPilotos : getSavedStandings();
    const sortedDrivers = sortDriversStandings(rawStandings);

    // Calculate sum of points per team
    const teamPointsMap = {};
    F1_TEAMS.forEach(t => { teamPointsMap[t] = 0; });
    const seenTeamDrivers = new Set();
    sortedDrivers.forEach(d => {
        if (!d || !d.driver || !d.team) return;
        const normKey = normalizeDriverKey(d.driver);
        if (seenTeamDrivers.has(normKey)) return;
        seenTeamDrivers.add(normKey);
        const cTeam = d.team.trim().toLowerCase();
        const m = F1_TEAMS.find(t => t.toLowerCase() === cTeam);
        if (m) {
            teamPointsMap[m] += Number(d.pts) || 0;
        }
    });

    const constructorRows = F1_TEAMS.map(team => ({
        team,
        pts: teamPointsMap[team] || 0
    }));
    const officialTeamOrder = ["HRT", "Red Bull", "Ferrari", "Mercedes", "Toro Rosso", "Williams", "Sauber", "Lotus", "McLaren", "Virgin", "Force India", "Renault"];
    constructorRows.sort((a, b) => {
        const diff = b.pts - a.pts;
        if (diff !== 0) return diff;
        return officialTeamOrder.indexOf(a.team) - officialTeamOrder.indexOf(b.team);
    });

    const leaderPts = constructorRows[0] ? constructorRows[0].pts : 0;
    const teamRankIdx = constructorRows.findIndex(t => t.team.toLowerCase() === matchedTeam.toLowerCase());
    const rankPos = teamRankIdx !== -1 ? teamRankIdx + 1 : 1;
    const teamPts = teamPointsMap[matchedTeam] || 0;
    const diffWithLeader = rankPos === 1 ? "--" : `-${Math.max(0, leaderPts - teamPts)}`;

    // 2. Find all drivers of this team
    const teamDriversMap = new Map();
    // From official roster
    const roster = getOfficialDriverRoster();
    roster.forEach(r => {
        if (r.team && r.team.trim().toLowerCase() === clean && r.driver) {
            const k = normalizeDriverKey(r.driver);
            teamDriversMap.set(k, { driver: r.driver.trim(), dorsal: r.dorsal || "" });
        }
    });
    // From current standings
    sortedDrivers.forEach((d, idx) => {
        const dTeam = getDriverTeam(d.driver) || d.team || "";
        if (dTeam.trim().toLowerCase() === clean && d.driver) {
            const k = normalizeDriverKey(d.driver);
            const existing = teamDriversMap.get(k) || {};
            teamDriversMap.set(k, {
                driver: d.driver.trim(),
                dorsal: existing.dorsal || "",
                pts: Number(d.pts) || 0,
                pos: idx + 1
            });
        }
    });

    // Merge metadata (flag, number)
    if (typeof ffc2010SeasonDrivers !== "undefined" && Array.isArray(ffc2010SeasonDrivers)) {
        ffc2010SeasonDrivers.forEach(fd => {
            const k = normalizeDriverKey(fd.driver);
            if (teamDriversMap.has(k)) {
                const cur = teamDriversMap.get(k);
                if (!cur.dorsal && fd.number) cur.dorsal = fd.number;
                if (!cur.flag && fd.flag) cur.flag = fd.flag;
            }
        });
    }

    const teamDrivers = Array.from(teamDriversMap.values()).map(d => {
        const stats = findDriverStats(d.driver);
        return {
            driver: d.driver,
            dorsal: d.dorsal || (stats ? stats.number : ""),
            flag: d.flag || (stats ? stats.flag : "🏁"),
            pos: d.pos || (stats ? stats.pos : "--"),
            pts: d.pts !== undefined ? d.pts : (stats ? stats.pts : 0)
        };
    });
    teamDrivers.sort((a, b) => (b.pts || 0) - (a.pts || 0));

    // 3. Compute Round-by-Round Breakdown for Team (R1 to R15)
    let wins = 0;
    let podiums = 0;
    let poles = 0;
    let fastestLaps = 0;
    let racesParticipated = 0;

    const teamDriverKeys = new Set(teamDrivers.map(d => normalizeDriverKey(d.driver)));

    const dynamicMatrix = getDynamicSeasonMatrixData();
    const teamMatrixDrivers = dynamicMatrix.filter(d => {
        const t = d.team || "";
        return t.trim().toLowerCase() === clean || teamDriverKeys.has(normalizeDriverKey(d.driver));
    });

    const rounds = FFC_SEASON_GPS.map((gp, idx) => {
        const race = raceResults[gp.raceKey];
        const isCompleted = race && (race.status === "COMPLETED" || (race.winner && race.winner !== "TBA"));

        // Check if pole / fast lap belong to this team
        let hasPole = false;
        let hasFL = false;
        if (race) {
            if (race.pole && race.pole !== "TBA") {
                const poleName = race.pole.split("·")[0].trim();
                if (teamDriverKeys.has(normalizeDriverKey(poleName))) {
                    hasPole = true;
                    poles++;
                }
            }
            if (race.fastest && race.fastest !== "TBA") {
                const flName = race.fastest.split("·")[0].trim();
                if (teamDriverKeys.has(normalizeDriverKey(flName))) {
                    hasFL = true;
                    fastestLaps++;
                }
            }
        }

        // Sum points and check best finishes from dynamic matrix
        let roundPts = 0;
        let bestPos = 999;
        let hadActivity = false;
        let allOut = true;

        teamMatrixDrivers.forEach(d => {
            const val = (d.r && d.r[idx]) ? String(d.r[idx]) : "--";
            if (val === "--") return;

            hadActivity = true;
            if (val === "OUT" || val === "DSQ") {
                return;
            }
            allOut = false;

            if (val.includes("(") && val.includes(")")) {
                if (!hasPole) { hasPole = true; poles++; }
            }
            if (val.includes("*")) {
                if (!hasFL) { hasFL = true; fastestLaps++; }
            }

            const numStr = val.replace(/[\(\)\*]/g, "");
            const pts = parseInt(numStr, 10) || 0;
            roundPts += pts;
            if (pts >= 25) {
                if (bestPos > 1) bestPos = 1;
            } else if (pts >= 18) {
                if (bestPos > 2) bestPos = 2;
            } else if (pts >= 15) {
                if (bestPos > 3) bestPos = 3;
            } else if (pts > 0) {
                if (bestPos > 10) bestPos = 10;
            }
        });

        if (hadActivity || isCompleted) {
            racesParticipated++;
        }

        let isWin = bestPos === 1;
        let isPodium = bestPos <= 3;
        if (isWin) wins++;
        else if (isPodium) podiums++;

        return {
            raw: (hadActivity || isCompleted) ? (roundPts > 0 ? `${roundPts}` : (allOut && hadActivity ? "OUT" : "0")) : "--",
            pts: roundPts,
            bestPos: bestPos === 999 ? null : bestPos,
            hasPole,
            hasFL,
            isWin,
            isPodium,
            allDnf: allOut && hadActivity,
            completed: hadActivity || isCompleted
        };
    });

    return {
        team: matchedTeam,
        meta,
        pos: rankPos,
        pts: teamPts,
        dif: diffWithLeader,
        drivers: teamDrivers,
        rounds,
        stats: {
            wins,
            podiums,
            poles,
            fastestLaps,
            driverCount: teamDrivers.length,
            races: racesParticipated
        }
    };
}

function openTeamStatsModal(teamName) {
    const data = findTeamStats(teamName);
    if (!data) return;

    currentOpenModalTeam = data.team;
    const overlay = document.getElementById("teamModalOverlay");
    if (!overlay) return;

    const isEn = typeof currentLanguage !== "undefined" && currentLanguage === "en";
    const teamCls = getTeamClass(data.team);

    // Modal strip
    const strip = document.getElementById("teamModalStrip");
    if (strip) strip.className = `team-modal-strip ${teamCls}`;

    // Logo / Monogram
    const logoText = document.getElementById("teamModalLogoText");
    if (logoText) logoText.textContent = data.meta.code || data.team.slice(0, 3).toUpperCase();

    // Flag & Name
    const flagEl = document.getElementById("teamModalFlag");
    if (flagEl) flagEl.textContent = data.meta.flag || "🏁";

    const nameEl = document.getElementById("teamModalName");
    if (nameEl) nameEl.textContent = data.team;

    // Full Name Pill
    const pillEl = document.getElementById("teamModalPill");
    if (pillEl) {
        pillEl.textContent = data.meta.fullName || data.team;
        pillEl.className = `team-modal-team-pill ${teamCls}`;
    }

    // Role badge
    const roleBadgeEl = document.getElementById("teamModalRoleBadge");
    if (roleBadgeEl) {
        if (data.pos === 1) {
            roleBadgeEl.textContent = isEn ? "CONSTRUCTOR LEADER" : "LÍDER DE CONSTRUCTORES";
        } else if (data.pos <= 3) {
            roleBadgeEl.textContent = isEn ? "PODIUM CONTENDER" : "PODIO DE CONSTRUCTORES";
        } else if (data.pos <= 6) {
            roleBadgeEl.textContent = isEn ? "TOP 6 CONSTRUCTOR" : "TOP 6 DE CONSTRUCTORES";
        } else {
            roleBadgeEl.textContent = isEn ? "OFFICIAL CONSTRUCTOR" : "CONSTRUCTOR FFC 2010";
        }
    }

    // KPIs
    const kpiPos = document.getElementById("teamKpiPos");
    if (kpiPos) kpiPos.textContent = `P${data.pos}`;

    const kpiPts = document.getElementById("teamKpiPts");
    if (kpiPts) kpiPts.textContent = `${data.pts}`;

    const kpiGap = document.getElementById("teamKpiGap");
    if (kpiGap) {
        if (data.pos === 1 || data.dif === "--" || data.dif === "0") {
            kpiGap.textContent = isEn ? "LEADER" : "LÍDER";
        } else {
            kpiGap.textContent = data.dif.startsWith("-") ? `${data.dif} PTS` : `-${data.dif} PTS`;
        }
    }

    const kpiWins = document.getElementById("teamKpiWins");
    if (kpiWins) kpiWins.textContent = `${data.stats.wins}`;

    const kpiPodiums = document.getElementById("teamKpiPodiums");
    if (kpiPodiums) kpiPodiums.textContent = `${data.stats.podiums}`;

    const kpiPoles = document.getElementById("teamKpiPoles");
    if (kpiPoles) kpiPoles.textContent = `${data.stats.poles}`;

    const kpiFastest = document.getElementById("teamKpiFastest");
    if (kpiFastest) kpiFastest.textContent = `${data.stats.fastestLaps}`;

    const kpiDrivers = document.getElementById("teamKpiDrivers");
    if (kpiDrivers) kpiDrivers.textContent = `${data.stats.driverCount}`;

    // Bilingual labels
    const lblPos = document.getElementById("lblTeamKpiPos");
    if (lblPos) lblPos.textContent = isEn ? "POSITION" : "POSICIÓN";
    const lblPts = document.getElementById("lblTeamKpiPts");
    if (lblPts) lblPts.textContent = isEn ? "POINTS" : "PUNTOS";
    const lblGap = document.getElementById("lblTeamKpiGap");
    if (lblGap) lblGap.textContent = isEn ? "GAP" : "DIFERENCIA";
    const lblWins = document.getElementById("lblTeamKpiWins");
    if (lblWins) lblWins.textContent = isEn ? "WINS" : "VICTORIAS";
    const lblPodiums = document.getElementById("lblTeamKpiPodiums");
    if (lblPodiums) lblPodiums.textContent = isEn ? "PODIUMS" : "PODIOS";
    const lblPoles = document.getElementById("lblTeamKpiPoles");
    if (lblPoles) lblPoles.textContent = isEn ? "POLES" : "POLES";
    const lblFastest = document.getElementById("lblTeamKpiFastest");
    if (lblFastest) lblFastest.textContent = isEn ? "F. LAPS" : "V. RÁPIDAS";
    const lblDrivers = document.getElementById("lblTeamKpiDrivers");
    if (lblDrivers) lblDrivers.textContent = isEn ? "DRIVERS" : "PILOTOS";

    const lblSquadTitle = document.getElementById("lblSquadTitle");
    if (lblSquadTitle) lblSquadTitle.textContent = isEn ? "DRIVER SQUAD" : "ALINEACIÓN DE PILOTOS";
    const lblSquadSub = document.getElementById("lblSquadSub");
    if (lblSquadSub) lblSquadSub.textContent = isEn ? "POINTS & STANDINGS" : "PUNTOS Y CLASIFICACIÓN";

    const lblTeamRoundsTitle = document.getElementById("lblTeamRoundsTitle");
    if (lblTeamRoundsTitle) lblTeamRoundsTitle.textContent = isEn ? "FFC 2010 CAMPAIGN (R1 - R15)" : "TRAYECTORIA FFC 2010 (R1 - R15)";
    const lblTeamRoundsSub = document.getElementById("lblTeamRoundsSub");
    if (lblTeamRoundsSub) lblTeamRoundsSub.textContent = isEn ? "COMBINED POINTS PER RACE" : "PUNTOS COMBINADOS POR CARRERA";

    // Squad Drivers List
    const squadGrid = document.getElementById("teamModalSquadGrid");
    if (squadGrid) {
        squadGrid.innerHTML = "";
        if (data.drivers.length === 0) {
            squadGrid.innerHTML = `<div style="font-size: 12px; color: #7f8897; padding: 6px 0;">${isEn ? "No drivers registered yet" : "Sin pilotos asignados aún"}</div>`;
        } else {
            data.drivers.forEach(d => {
                const card = document.createElement("div");
                card.className = "team-squad-card driver-clickable";
                card.setAttribute("data-driver", d.driver);
                card.setAttribute("title", isEn ? `View ${d.driver}'s stats` : `Ver estadísticas de ${d.driver}`);
                card.innerHTML = `
                    <div class="team-squad-card-left">
                        <span class="team-squad-dorsal">${d.dorsal ? '#' + d.dorsal : ''}</span>
                        <span class="team-squad-flag">${getFlagHtml(d.flag || getOfficialDriverFlag(d.driver), 18)}</span>
                        <span class="team-squad-name">${escapeHtml(d.driver)}</span>
                    </div>
                    <div class="team-squad-card-right">
                        <span class="team-squad-pos">${d.pos ? 'P' + d.pos : ''}</span>
                        <span class="team-squad-pts">${d.pts} PTS</span>
                    </div>
                `;
                squadGrid.appendChild(card);
            });
        }
    }

    // Populate Rounds Grid for Team
    const roundsGrid = document.getElementById("teamModalRoundsGrid");
    if (roundsGrid) {
        roundsGrid.innerHTML = "";
        FFC_SEASON_GPS.forEach((gp, idx) => {
            const rData = (data.rounds && data.rounds[idx]) ? data.rounds[idx] : { raw: "--", pts: 0, hasPole: false, hasFL: false, isWin: false, isPodium: false, allDnf: false, completed: false };
            const card = document.createElement("div");
            card.className = "round-card-mini round-card-clickable";
            card.setAttribute("data-race", gp.raceKey);
            card.setAttribute("data-round", gp.r);
            card.setAttribute("role", "button");
            card.setAttribute("tabindex", "0");
            const gpTitle = isEn
                ? `Round ${gp.r} - ${gp.name} GP (Click to view race)`
                : `Ronda ${gp.r} - GP de ${gp.name} (Clic para ir a la carrera)`;
            card.setAttribute("title", gpTitle);
            card.setAttribute("aria-label", gpTitle);

            let pillClass = "res-none";
            let pillText = rData.raw;

            if (rData.completed) {
                if (rData.isWin) {
                    pillClass = "res-win";
                    pillText = `🏆 ${rData.pts}`;
                } else if (rData.isPodium) {
                    pillClass = "res-podium";
                    pillText = `${rData.pts}`;
                } else if (rData.pts > 0) {
                    pillClass = "res-pts";
                    pillText = `${rData.pts}`;
                } else if (rData.allDnf) {
                    pillClass = "res-out";
                    pillText = "DNF";
                } else {
                    pillClass = "res-none";
                    pillText = "0";
                }
            } else {
                pillClass = "res-none";
                pillText = "--";
            }

            let badgesHtml = "";
            if (rData.hasPole) badgesHtml += `<span class="extra-badge badge-pole" title="Pole Position">P</span>`;
            if (rData.hasFL) badgesHtml += `<span class="extra-badge badge-fl" title="Vuelta Rápida">FL</span>`;

            card.innerHTML = `
                <div class="round-card-mini-top">
                    <span class="round-card-mini-flag">${getFlagHtml(gp.flag, 16)}</span>
                    <span>R${gp.r}</span>
                </div>
                <div class="round-res-pill ${pillClass}">${pillText}</div>
                <div class="round-card-badges">${badgesHtml}</div>
            `;

            roundsGrid.appendChild(card);
        });
    }

    overlay.classList.add("active");
    overlay.setAttribute("aria-hidden", "false");
    document.body.style.overflow = "hidden";
}

function closeTeamStatsModal() {
    currentOpenModalTeam = null;
    const overlay = document.getElementById("teamModalOverlay");
    if (!overlay) return;
    overlay.classList.remove("active");
    overlay.setAttribute("aria-hidden", "true");
    document.body.style.overflow = "";
}

function initTeamStatsModal() {
    const overlay = document.getElementById("teamModalOverlay");
    const closeBtn = document.getElementById("closeTeamModal");

    if (closeBtn) {
        closeBtn.addEventListener("click", (e) => {
            e.stopPropagation();
            closeTeamStatsModal();
        });
    }

    if (overlay) {
        overlay.addEventListener("click", (e) => {
            if (e.target === overlay) {
                closeTeamStatsModal();
            }
        });
    }

    document.addEventListener("keydown", (e) => {
        if (e.key === "Escape" && overlay && overlay.classList.contains("active")) {
            closeTeamStatsModal();
        }
    });
}

/* =========================================================
   FFC GLOBAL 3D COBE GLOBE TELEMETRY SYSTEM
========================================================= */
function initInteractiveChampionshipMap() {
    initCobeGlobe("hero-cobe-globe-container");
}

// Initialize modals on script load / DOM ready
if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", () => {
        initAllCountriesDatalist();
        initStandingsViewTabs();
        initDriverStatsModal();
        initTeamStatsModal();
        initInteractiveChampionshipMap();
    });
} else {
    initAllCountriesDatalist();
    initStandingsViewTabs();
    initDriverStatsModal();
    initTeamStatsModal();
    initInteractiveChampionshipMap();
}

function updateConstructorStandings(driverList) {
    // Calculate sum of points per team
    const teamPointsMap = {};
    F1_TEAMS.forEach(t => { teamPointsMap[t] = 0; });

    const seen = new Set();
    driverList.forEach(d => {
        if (!d || !d.driver || !d.team) return;
        const norm = normalizeDriverKey(d.driver);
        if (seen.has(norm)) return;
        seen.add(norm);

        const cleanTeam = d.team.trim().toLowerCase();
        const matched = F1_TEAMS.find(t => t.toLowerCase() === cleanTeam);
        if (matched) {
            teamPointsMap[matched] += Number(d.pts) || 0;
        }
    });

    const constructorRows = F1_TEAMS.map(team => ({
        team,
        pts: teamPointsMap[team] || 0
    }));

    // Sort descending by points with official tie-breaker ordering
    const officialTeamOrder = ["HRT", "Red Bull", "Ferrari", "Mercedes", "Toro Rosso", "Williams", "Sauber", "Lotus", "McLaren", "Virgin", "Force India", "Renault"];
    constructorRows.sort((a, b) => {
        const diff = b.pts - a.pts;
        if (diff !== 0) return diff;
        return officialTeamOrder.indexOf(a.team) - officialTeamOrder.indexOf(b.team);
    });

    const leaderPts = constructorRows[0] ? constructorRows[0].pts : 0;
    const tiedLeaders = constructorRows.filter(r => r.pts === leaderPts && leaderPts > 0);
    const isLeaderTied = tiedLeaders.length > 1;

    const isEn = typeof currentLanguage !== "undefined" && currentLanguage === "en";
    const leaderBadgeText = isEn ? "LEADER" : "LÍDER";
    const trophySvg = `
        <svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor" class="leader-trophy-icon" aria-hidden="true">
            <path d="M19 5h-2V3H7v2H5c-1.1 0-2 .9-2 2v1c0 2.55 1.92 4.63 4.39 4.94A5.01 5.01 0 0 0 11 15.9V19H8v2h8v-2h-3v-3.1c1.84-.36 3.28-1.78 3.61-3.96C19.08 11.63 21 9.55 21 8V7c0-1.1-.9-2-2-2zM5 8V7h2v3.82C5.84 10.4 5 9.3 5 8zm14 0c0 1.3-.84 2.4-2 2.82V7h2v1z"/>
        </svg>
    `;

    if (isLeaderTied) {
        // Tied P1 Hero Row: Empate badge top-center, Left: "1." + Team 1, Center: Points, Right: Team 2
        if (teamLeaderRow) {
            teamLeaderRow.classList.add("is-tied");
            teamLeaderRow.classList.remove("team-card-clickable");
            teamLeaderRow.removeAttribute("data-team");
            const t1 = tiedLeaders[0];
            const t2 = tiedLeaders[1];
            const tieBadgeText = isEn ? "TIE" : "EMPATE";
            teamLeaderRow.innerHTML = `
                <div class="ranking-tied-badge" id="teamTiedBadge">
                    <span>${tieBadgeText}</span>
                </div>
                <div class="ranking-tied-left team-clickable" data-team="${escapeHtml(t1.team)}" title="${isEn ? 'View ' + escapeHtml(t1.team) + ' stats' : 'Ver estadísticas de ' + escapeHtml(t1.team)}">
                    <span class="ranking-leader-pos">1.</span>
                    <div class="ranking-tied-team">
                        <span class="ranking-team-pill ${getTeamClass(t1.team)}"><span class="team-dot"></span>${escapeHtml(t1.team)}</span>
                    </div>
                </div>
                <div class="ranking-tied-center">
                    <div class="ranking-pts-tag ranking-tied-pts">
                        <strong class="pts-num">${t1.pts}</strong>
                        <small class="pts-label">PTS</small>
                    </div>
                </div>
                <div class="ranking-tied-right team-clickable" data-team="${escapeHtml(t2 ? t2.team : '')}" title="${isEn ? 'View ' + escapeHtml(t2 ? t2.team : '') + ' stats' : 'Ver estadísticas de ' + escapeHtml(t2 ? t2.team : '')}">
                    <div class="ranking-tied-team">
                        <span class="ranking-team-pill ${getTeamClass(t2 ? t2.team : '')}"><span class="team-dot"></span>${escapeHtml(t2 ? t2.team : '')}</span>
                    </div>
                </div>
            `;
        }

        // Hide P2 & P3 podium split when P1 is tied
        if (teamPodiumSplit) {
            teamPodiumSplit.style.display = "none";
        }

        // Start rows list from tiedLeaders.length (position 3 if 2 tied)
        if (teamRowsList) {
            teamRowsList.innerHTML = "";
            for (let idx = tiedLeaders.length; idx < constructorRows.length; idx++) {
                const row = constructorRows[idx];
                const diff = row.pts - leaderPts === 0 ? "0" : `${row.pts - leaderPts}`;
                const rowDiv = document.createElement("div");
                rowDiv.className = "ranking-row team-row-clickable";
                rowDiv.setAttribute("data-team", row.team);
                rowDiv.setAttribute("title", isEn ? `View ${row.team} stats` : `Ver estadísticas de ${row.team}`);
                const teamClass = getTeamClass(row.team);
                rowDiv.innerHTML = `
                    <div class="team-color-strip ${teamClass}"></div>
                    <span class="ranking-row-pos">${idx + 1}</span>
                    <span class="ranking-team-cell"><span class="ranking-team-flat ${teamClass}">${escapeHtml(row.team)}</span></span>
                    <span class="ranking-row-pts">${row.pts}</span>
                    <span class="ranking-row-diff">${diff}</span>
                `;
                teamRowsList.appendChild(rowDiv);
            }
        }
    } else {
        // Standard Single Leader Flow
        if (teamLeaderRow) {
            teamLeaderRow.classList.remove("is-tied");
            teamLeaderRow.classList.add("team-card-clickable");
            if (constructorRows[0]) {
                const t1 = constructorRows[0];
                teamLeaderRow.setAttribute("data-team", t1.team);
                teamLeaderRow.setAttribute("title", isEn ? `View ${t1.team} stats` : `Ver estadísticas de ${t1.team}`);
                teamLeaderRow.innerHTML = `
                    <div class="ranking-leader-left">
                        <span class="ranking-leader-pos">1.</span>
                        <div class="ranking-leader-info">
                            <span class="ranking-leader-name ${getTeamClass(t1.team)}">${escapeHtml(t1.team)}</span>
                            <div class="ranking-leader-meta">
                                <span class="ranking-team-pill ${getTeamClass(t1.team)}"><span class="team-dot"></span>${escapeHtml(t1.team)}</span>
                            </div>
                        </div>
                    </div>
                    <div class="ranking-leader-right">
                        <div class="ranking-pts-tag">
                            <strong class="pts-num">${t1.pts}</strong>
                            <small class="pts-label">PTS</small>
                        </div>
                        <div class="leader-badge-pill" id="teamLeaderBadge">
                            <span class="leader-badge-text">${leaderBadgeText}</span>
                            ${trophySvg}
                        </div>
                    </div>
                `;
            }
        }

        if (teamPodiumSplit) {
            teamPodiumSplit.style.display = "";
            const t2 = constructorRows[1];
            const t3 = constructorRows[2];
            const diff2 = t2 ? (t2.pts - leaderPts === 0 ? "0" : `${t2.pts - leaderPts}`) : "0";
            const diff3 = t3 ? (t3.pts - leaderPts === 0 ? "0" : `${t3.pts - leaderPts}`) : "0";

            let p2Html = "";
            let p3Html = "";

            if (t2) {
                p2Html = `
                    <div class="ranking-podium-col ranking-p2 team-card-clickable" id="teamP2Col" data-team="${escapeHtml(t2.team)}" title="${isEn ? 'View ' + escapeHtml(t2.team) + ' stats' : 'Ver estadísticas de ' + escapeHtml(t2.team)}">
                        <div class="ranking-podium-left">
                            <span class="ranking-podium-pos">2.</span>
                            <div class="ranking-podium-info">
                                <span class="ranking-podium-name ${getTeamClass(t2.team)}">${escapeHtml(t2.team)}</span>
                                <div class="ranking-podium-meta">
                                    <span class="ranking-diff">${diff2} DIF.</span>
                                </div>
                            </div>
                        </div>
                        <div class="ranking-podium-right">
                            <div class="ranking-pts-tag">
                                <strong class="pts-num">${t2.pts}</strong>
                                <small class="pts-label">PTS</small>
                            </div>
                        </div>
                    </div>
                `;
            }

            if (t3) {
                p3Html = `
                    <div class="ranking-podium-col ranking-p3 team-card-clickable" id="teamP3Col" data-team="${escapeHtml(t3.team)}" title="${isEn ? 'View ' + escapeHtml(t3.team) + ' stats' : 'Ver estadísticas de ' + escapeHtml(t3.team)}">
                        <div class="ranking-podium-left">
                            <span class="ranking-podium-pos">3.</span>
                            <div class="ranking-podium-info">
                                <span class="ranking-podium-name ${getTeamClass(t3.team)}">${escapeHtml(t3.team)}</span>
                                <div class="ranking-podium-meta">
                                    <span class="ranking-diff">${diff3} DIF.</span>
                                </div>
                            </div>
                        </div>
                        <div class="ranking-podium-right">
                            <div class="ranking-pts-tag">
                                <strong class="pts-num">${t3.pts}</strong>
                                <small class="pts-label">PTS</small>
                            </div>
                        </div>
                    </div>
                `;
            }

            teamPodiumSplit.innerHTML = p2Html + p3Html;
        }

        if (teamRowsList) {
            teamRowsList.innerHTML = "";
            for (let idx = 3; idx < constructorRows.length; idx++) {
                const row = constructorRows[idx];
                const diff = row.pts - leaderPts === 0 ? "0" : `${row.pts - leaderPts}`;
                const rowDiv = document.createElement("div");
                rowDiv.className = "ranking-row team-row-clickable";
                rowDiv.setAttribute("data-team", row.team);
                rowDiv.setAttribute("title", isEn ? `View ${row.team} stats` : `Ver estadísticas de ${row.team}`);
                const teamClass = getTeamClass(row.team);
                rowDiv.innerHTML = `
                    <div class="team-color-strip ${teamClass}"></div>
                    <span class="ranking-row-pos">${idx + 1}</span>
                    <span class="ranking-team-cell"><span class="ranking-team-flat ${teamClass}">${escapeHtml(row.team)}</span></span>
                    <span class="ranking-row-pts">${row.pts}</span>
                    <span class="ranking-row-diff">${diff}</span>
                `;
                teamRowsList.appendChild(rowDiv);
            }
        }
    }

    // Fallback if legacy constructorsTableBody is present
    if (constructorsTableBody) {
        constructorsTableBody.innerHTML = "";
        constructorRows.forEach((row, idx) => {
            const tr = document.createElement("tr");
            if (idx === 0) tr.classList.add("leader");
            const diff = idx === 0 ? "—" : (row.pts - leaderPts === 0 ? "0" : `${row.pts - leaderPts}`);
            tr.innerHTML = `
                <td>${idx + 1}</td>
                <td class="${getTeamClass(row.team)} team-clickable" data-team="${escapeHtml(row.team)}" title="Ver estadísticas de ${escapeHtml(row.team)}">${escapeHtml(row.team)}</td>
                <td>${row.pts}</td>
                <td>${diff}</td>
            `;
            constructorsTableBody.appendChild(tr);
        });
    }
}

function updateStandingsToggleUI(totalCount) {
    const btn = document.getElementById("toggleStandingsBtn");
    const label = document.getElementById("standingsToggleLabel");
    if (!btn || !label) return;

    if (totalCount <= 12) {
        btn.parentElement.style.display = "none";
        return;
    }
    btn.parentElement.style.display = "flex";

    const isEn = typeof currentLanguage !== "undefined" && currentLanguage === "en";

    if (isStandingsExpanded) {
        label.textContent = isEn ? "SHOW LESS (TOP 12)" : "MOSTRAR MENOS (TOP 12)";
        btn.classList.add("is-expanded");
        btn.setAttribute("aria-expanded", "true");
    } else {
        label.textContent = isEn
            ? `VIEW FULL STANDINGS (P13 - P${totalCount})`
            : `VER CLASIFICACIÓN COMPLETA (P13 - P${totalCount})`;
        btn.classList.remove("is-expanded");
        btn.setAttribute("aria-expanded", "false");
    }
}

function renderAdminStandingsEditor(drivers) {
    if (!adminStandingsTableBody) return;
    adminStandingsTableBody.innerHTML = "";

    const sorted = sortDriversStandings(drivers);

    sorted.forEach((d, idx) => {
        const officialTeam = getDriverTeam(d.driver) || d.team || "Independent";
        const pilotId = d.id || getPilotDocId(d.driver);
        const tr = document.createElement("tr");
        tr.dataset.index = idx;
        tr.dataset.pilotId = pilotId;
        tr.innerHTML = `
            <td style="font-weight: bold; color: var(--gold); text-align: center;">${idx + 1}</td>
            <td><input type="text" class="driver-name-input" value="${escapeHtml(d.driver)}" required></td>
            <td class="team-locked-cell">
                <span class="team-locked-badge ${getTeamClass(officialTeam)}" title="Equipo oficial (Modificable en la pestaña 'Pilotos')">${escapeHtml(officialTeam)}</span>
                <input type="hidden" class="driver-team-input" value="${escapeHtml(officialTeam)}">
            </td>
            <td><input type="number" class="driver-pts-input" value="${Number(d.pts)}" min="0" required></td>
            <td style="text-align: center;"><button type="button" class="admin-remove-btn" data-pilot-id="${pilotId}" title="Eliminar de clasificación">🗑</button></td>
        `;

        const nameInput = tr.querySelector(".driver-name-input");
        const teamBadge = tr.querySelector(".team-locked-badge");
        const teamInput = tr.querySelector(".driver-team-input");

        nameInput.addEventListener("blur", () => {
            const team = getDriverTeam(nameInput.value.trim());
            teamBadge.textContent = team;
            teamBadge.className = `team-locked-badge ${getTeamClass(team)}`;
            teamInput.value = team;
        });

        adminStandingsTableBody.appendChild(tr);
    });

    // Wire remove buttons with Firestore real-time deletion
    adminStandingsTableBody.querySelectorAll(".admin-remove-btn").forEach(btn => {
        btn.addEventListener("click", async (e) => {
            const row = e.target.closest("tr");
            const pilotId = btn.dataset.pilotId || (row ? row.dataset.pilotId : "");
            const nameInput = row ? row.querySelector(".driver-name-input") : null;
            const driverName = nameInput ? nameInput.value.trim() : "este piloto";
            if (!pilotId) {
                if (row) row.remove();
                return;
            }
            const confirmed = await showAppConfirm("Eliminar Piloto", `¿Deseas eliminar a "${driverName}" de Firestore?`, "Eliminar", "Cancelar");
            if (confirmed) {
                try {
                    await deleteDoc(doc(db, "pilotos", pilotId));
                    if (row) row.remove();
                } catch (err) {
                    console.error("Error deleting driver from Firestore:", err);
                }
            }
        });
    });
}

// --- Settings Logic ---
function extractTwitchChannel(input) {
    if (!input) return "driezzz12";
    let cleaned = String(input).trim().replace(/\/+$/, "");
    const match = cleaned.match(/(?:twitch\.tv\/)?([a-zA-Z0-9_]+)$/i);
    return match ? match[1] : (cleaned || "driezzz12");
}

function buildTwitchEmbedUrl(channelInput) {
    const chan = extractTwitchChannel(channelInput);
    const parents = new Set();
    if (typeof window !== "undefined" && window.location && window.location.hostname) {
        parents.add(window.location.hostname);
    }
    parents.add("ais-dev-llhirdz3pjvgtgrzjmkdqn-850418529081.europe-west2.run.app");
    parents.add("ais-pre-llhirdz3pjvgtgrzjmkdqn-850418529081.europe-west2.run.app");
    parents.add("localhost");
    parents.add("127.0.0.1");

    const parentQuery = Array.from(parents).map(p => `parent=${encodeURIComponent(p)}`).join("&");
    return `https://player.twitch.tv/?channel=${encodeURIComponent(chan)}&${parentQuery}&autoplay=true&muted=false`;
}

function buildTwitchChatEmbedUrl(channelInput) {
    const chan = extractTwitchChannel(channelInput);
    const parents = new Set();
    if (typeof window !== "undefined" && window.location && window.location.hostname) {
        parents.add(window.location.hostname);
    }
    try {
        if (typeof document !== "undefined" && document.referrer) {
            const refUrl = new URL(document.referrer);
            if (refUrl.hostname) parents.add(refUrl.hostname);
        }
    } catch(e) {}
    try {
        if (typeof window !== "undefined" && window.parent && window.parent.location && window.parent.location.hostname) {
            parents.add(window.parent.location.hostname);
        }
    } catch(e) {}
    parents.add("ais-dev-llhirdz3pjvgtgrzjmkdqn-850418529081.europe-west2.run.app");
    parents.add("ais-pre-llhirdz3pjvgtgrzjmkdqn-850418529081.europe-west2.run.app");
    parents.add("ai.studio");
    parents.add("aistudio.google.com");
    parents.add("localhost");
    parents.add("127.0.0.1");

    const parentQuery = Array.from(parents).filter(Boolean).map(p => `parent=${encodeURIComponent(p)}`).join("&");
    return `https://www.twitch.tv/embed/${encodeURIComponent(chan)}/chat?${parentQuery}&darkpopout=true`;
}

window.reloadLiveTwitchChat = function() {
    const twitchChatPlayerContainer = document.getElementById("twitchChatPlayerContainer");
    if (!twitchChatPlayerContainer) return;
    const settings = getSavedSettings();
    const channel = extractTwitchChannel(settings?.twitchChannel || "https://www.twitch.tv/driezzz12");
    const chatEmbedUrl = buildTwitchChatEmbedUrl(channel);
    twitchChatPlayerContainer.innerHTML = `<iframe 
        src="${chatEmbedUrl}" 
        data-channel="${channel}"
        scrolling="yes" 
        frameborder="0"
        title="Twitch Live Chat">
    </iframe>`;
};

function getSavedSettings() {
    if (currentSettings && (currentSettings.discordUrl !== undefined || currentSettings.season !== undefined || currentSettings.liveMode !== undefined)) {
        return currentSettings;
    }
    return defaultSettings;
}

function renderSettingsOnPage(settings) {
    if (!settings) settings = defaultSettings;
    if (settings.discordUrl) {
        document.querySelectorAll(".discord-btn").forEach(btn => {
            btn.href = settings.discordUrl;
        });
        const discordLinks = document.querySelectorAll('a[href*="discord.gg"]');
        discordLinks.forEach(link => {
            link.href = settings.discordUrl;
        });
    }
    if (settings.xUrl) {
        document.querySelectorAll('a.social-x, a[href*="x.com"]').forEach(link => {
            link.href = settings.xUrl;
        });
    }
    if (settings.instagramUrl) {
        document.querySelectorAll('a.social-instagram, a[href*="instagram.com"]').forEach(link => {
            link.href = settings.instagramUrl;
        });
    }
    if (statSeasonEl && settings.season) statSeasonEl.textContent = settings.season;
    if (statRoundsEl && settings.rounds) statRoundsEl.textContent = settings.rounds;
    if (statDriversEl && settings.drivers) statDriversEl.textContent = settings.drivers;

    // Live Mode (Transmisión en directo Twitch & Chat)
    const heroSection = document.getElementById("home");
    const heroContentStandard = document.getElementById("heroContentStandard");
    const heroContentLive = document.getElementById("heroContentLive");
    const twitchPlayerContainer = document.getElementById("twitchPlayerContainer");
    const twitchExternalLink = document.getElementById("twitchExternalLink");
    const heroLiveHeading = document.getElementById("heroLiveHeading");
    const heroLiveSubtitle = document.getElementById("heroLiveSubtitle");

    // Next Race Card: Standard Countdown View vs Live Chat View
    const heroAsideCard = document.getElementById("heroAsideCard");
    const nextRaceStandardView = document.getElementById("nextRaceStandardView");
    const nextRaceLiveChatView = document.getElementById("nextRaceLiveChatView");
    const liveChatGpName = document.getElementById("liveChatGpName");
    const liveChatBadgeText = document.getElementById("liveChatBadgeText");
    const liveChatSuffixText = document.getElementById("liveChatSuffixText");
    const twitchChatPlayerContainer = document.getElementById("twitchChatPlayerContainer");
    const twitchChatPopoutLink = document.getElementById("twitchChatPopoutLink");

    const isLive = Boolean(settings && settings.liveMode);
    const channel = extractTwitchChannel(settings?.twitchChannel || "https://www.twitch.tv/driezzz12");
    const twitchUrl = `https://www.twitch.tv/${channel}`;

    if (heroSection) {
        heroSection.classList.toggle("is-live-mode", isLive);
    }

    if (heroContentStandard && heroContentLive) {
        if (isLive) {
            heroContentStandard.style.display = "none";
            heroContentLive.style.display = "flex";

            if (heroLiveHeading) {
                const defaultTitle = currentLanguage === "en" ? "WE ARE LIVE" : "ESTAMOS EN DIRECTO";
                heroLiveHeading.textContent = settings.liveTitle || defaultTitle;
            }
            if (heroLiveSubtitle) {
                const defaultSub = currentLanguage === "en"
                    ? "Watch the official championship race broadcast live on Twitch."
                    : "Sigue la retransmisión oficial de la carrera en vivo por Twitch.";
                heroLiveSubtitle.textContent = settings.liveSubtitle || defaultSub;
            }
            if (twitchExternalLink) {
                twitchExternalLink.href = twitchUrl;
            }

            // Mount or update Twitch video stream iframe
            if (twitchPlayerContainer) {
                const currentIframe = twitchPlayerContainer.querySelector("iframe");
                const embedUrl = buildTwitchEmbedUrl(channel);
                if (!currentIframe || currentIframe.dataset.channel !== channel) {
                    twitchPlayerContainer.innerHTML = `<iframe 
                        src="${embedUrl}" 
                        data-channel="${channel}"
                        allowfullscreen="true" 
                        scrolling="no" 
                        allow="autoplay; fullscreen"
                        title="Formula Factor Championship Twitch Live Stream">
                    </iframe>`;
                }
            }
        } else {
            heroContentStandard.style.display = "block";
            heroContentLive.style.display = "none";
            if (twitchPlayerContainer) {
                twitchPlayerContainer.innerHTML = "";
            }
        }
    }

    // Toggle and configure Next Race Card Live Chat View
    if (heroAsideCard && nextRaceStandardView && nextRaceLiveChatView) {
        if (isLive) {
            heroAsideCard.classList.add("is-live-chat-mode");
            nextRaceStandardView.style.display = "none";
            nextRaceLiveChatView.style.display = "flex";

            // Resolve GP Name for Live Chat Header
            let activeGpName = (settings && settings.liveRaceTitle) ? settings.liveRaceTitle.trim() : "";
            if (!activeGpName) {
                const raceData = getSavedNextRace();
                if (raceData && raceData.title) {
                    activeGpName = raceData.title.replace(/<br\s*[\/]?>/gi, " ").trim();
                } else {
                    activeGpName = "NÜRBURGRING GP";
                }
            }

            if (liveChatGpName) {
                liveChatGpName.textContent = activeGpName;
            }
            if (liveChatBadgeText) {
                liveChatBadgeText.textContent = currentLanguage === "en" ? "LIVE NOW" : "EN DIRECTO";
            }
            if (liveChatSuffixText) {
                liveChatSuffixText.textContent = currentLanguage === "en" ? "LIVE CHAT" : "CHAT EN VIVO";
            }
            if (twitchChatPopoutLink) {
                twitchChatPopoutLink.href = `https://www.twitch.tv/popout/${channel}/chat`;
            }

            // Mount or update Twitch Chat iframe
            if (twitchChatPlayerContainer) {
                const currentChatIframe = twitchChatPlayerContainer.querySelector("iframe");
                const chatEmbedUrl = buildTwitchChatEmbedUrl(channel);
                if (!currentChatIframe || currentChatIframe.dataset.channel !== channel) {
                    twitchChatPlayerContainer.innerHTML = `<iframe 
                        src="${chatEmbedUrl}" 
                        data-channel="${channel}"
                        scrolling="yes" 
                        frameborder="0"
                        title="Twitch Live Chat">
                    </iframe>`;
                }
            }
        } else {
            heroAsideCard.classList.remove("is-live-chat-mode");
            nextRaceStandardView.style.display = "flex";
            nextRaceLiveChatView.style.display = "none";
            if (twitchChatPlayerContainer) {
                twitchChatPlayerContainer.innerHTML = "";
            }
        }
    }

    // Fantasy Market Lock Synchronization
    const isFantasyLocked = Boolean(settings && settings.fantasyLocked);
    const lockMsg = (settings && settings.fantasyLockMessage) || "Mercado de fichajes congelado por Gran Premio en curso.";

    if (adminFantasyLocked) {
        adminFantasyLocked.checked = isFantasyLocked;
    }
    if (adminFantasyLockStatusText) {
        adminFantasyLockStatusText.textContent = isFantasyLocked ? "🔒 MERCADO BLOQUEADO (CARRERA EN CURSO)" : "MERCADO ABIERTO (FICHAJES ACTIVOS)";
        adminFantasyLockStatusText.classList.toggle("is-active", isFantasyLocked);
    }
    if (adminFantasyLockMessage && document.activeElement !== adminFantasyLockMessage) {
        adminFantasyLockMessage.value = lockMsg;
    }

    // Dynamic Price Fluctuation Settings Synchronization
    const isFluctEnabled = settings ? (settings.fantasyFluctuationEnabled !== false) : true;
    const volMultiplier = settings && typeof settings.fantasyVolatilityMultiplier === "number" ? settings.fantasyVolatilityMultiplier : 1.0;

    if (adminFantasyFluctuation) {
        adminFantasyFluctuation.checked = isFluctEnabled;
    }
    if (adminFantasyFluctuationStatusText) {
        adminFantasyFluctuationStatusText.textContent = isFluctEnabled ? "FLUCTUACIÓN DINÁMICA ACTIVADA" : "PRECIOS ESTÁTICOS BASE";
        adminFantasyFluctuationStatusText.classList.toggle("is-active", isFluctEnabled);
    }
    if (adminFantasyVolatility && document.activeElement !== adminFantasyVolatility) {
        adminFantasyVolatility.value = String(volMultiplier);
    }

    if (typeof renderAdminMarketSentimentWidget === "function") {
        renderAdminMarketSentimentWidget();
    }

    // Fantasy Portal Banner & Reset UI update
    const fantasyLockedBanner = document.getElementById("fantasyLockedBanner");
    const fantasyLockedDesc = document.getElementById("fantasyLockedDesc");
    if (fantasyLockedBanner) {
        fantasyLockedBanner.style.display = isFantasyLocked ? "flex" : "none";
    }
    if (fantasyLockedDesc) {
        fantasyLockedDesc.textContent = `${lockMsg} Las alineaciones están congeladas durante la carrera. No se permiten compras, ventas ni cambios de Turbo Driver hasta la reapertura del mercado.`;
    }

    const resetTeamBtn = document.getElementById("fantasyResetTeamBtn");
    if (resetTeamBtn) {
        resetTeamBtn.classList.toggle("is-locked", isFantasyLocked);
        if (isFantasyLocked) {
            resetTeamBtn.title = "Mercado bloqueado por carrera en curso";
        } else {
            resetTeamBtn.title = "Vende todos tus pilotos y constructor para recuperar los 75.0M€";
        }
    }

    // Trigger re-render of fantasy slots and market grid if already initialized
    if (window.isFantasyModuleInitialized && typeof window.renderFantasySlots === "function" && window.ffcFantasyState) {
        try {
            window.renderFantasySlots();
            if (window.ffcFantasyState.activeSubTab === "market" && typeof window.renderFantasyMarketGrid === "function") {
                window.renderFantasyMarketGrid();
            }
        } catch (e) {
            // Ignore if not rendered yet
        }
    }
}

function isFantasyMarketLocked() {
    const s = getSavedSettings();
    return Boolean(s && s.fantasyLocked);
}

function getFantasyLockMessage() {
    const s = getSavedSettings();
    return (s && s.fantasyLockMessage) || "Mercado de fichajes congelado por Gran Premio en curso.";
}

window.handleLockedAction = function() {
    const msg = getFantasyLockMessage();
    alert("🔒 " + msg);
};

// In-App Accessible Confirmation Modal (Guaranteed to work in iframes and all browsers)
function showAppConfirm(title, message, confirmText = "Confirmar", cancelText = "Cancelar") {
    return new Promise((resolve) => {
        let overlay = document.getElementById("customConfirmModal");
        if (!overlay) {
            overlay = document.createElement("div");
            overlay.id = "customConfirmModal";
            overlay.className = "custom-confirm-overlay";
            document.body.appendChild(overlay);
        }

        const paragraphs = String(message)
            .split("\n")
            .map(p => p.trim() ? `<p>${escapeHtml(p)}</p>` : "<div style='height:6px;'></div>")
            .join("");

        overlay.innerHTML = `
            <div class="custom-confirm-card" role="dialog" aria-modal="true">
                <div class="custom-confirm-header">
                    <span class="custom-confirm-icon">⚠️</span>
                    <h3 class="custom-confirm-title">${escapeHtml(title)}</h3>
                </div>
                <div class="custom-confirm-body">
                    ${paragraphs}
                </div>
                <div class="custom-confirm-actions">
                    <button type="button" class="btn btn-secondary btn-sm" id="customConfirmCancelBtn">${escapeHtml(cancelText)}</button>
                    <button type="button" class="btn btn-danger-outline btn-sm" id="customConfirmOkBtn">${escapeHtml(confirmText)}</button>
                </div>
            </div>
        `;

        overlay.classList.add("active");

        const cancelBtn = overlay.querySelector("#customConfirmCancelBtn");
        const okBtn = overlay.querySelector("#customConfirmOkBtn");

        let settled = false;
        const finish = (val) => {
            if (settled) return;
            settled = true;
            overlay.classList.remove("active");
            resolve(val);
        };

        cancelBtn.onclick = (e) => {
            e.stopPropagation();
            finish(false);
        };
        okBtn.onclick = (e) => {
            e.stopPropagation();
            finish(true);
        };
        overlay.onclick = (e) => {
            if (e.target === overlay) finish(false);
        };
    });
}

// --- Race Results Logic ---
function getCustomRaceResults() {
    return raceResults || {};
}

function initRaceResults() {
    raceResults = { ...defaultRaceResults };
    refreshAllCalendarCards();
}

function updateCalendarCardForRace(raceKey, raceData) {
    if (raceKey && raceData) {
        raceResults[raceKey] = raceData;
    }
    refreshAllCalendarCards();
}

// --- Official Driver Roster Management ---
function getOfficialDriverRoster() {
    if (currentPilotos && currentPilotos.length > 0) {
        return currentPilotos.map(p => ({
            id: p.id,
            driver: p.driver,
            team: p.team,
            flag: p.flag || p.customFlag || getOfficialDriverFlag(p.driver)
        }));
    }
    return defaultDriverRoster.map(p => ({
        ...p,
        flag: p.flag || getOfficialDriverFlag(p.driver)
    }));
}

function getDriverTeam(driverName) {
    if (!driverName) return "Independent";
    const key = driverName.trim().toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
    if (currentPilotos && currentPilotos.length > 0) {
        const found = currentPilotos.find(p => p.driver.trim().toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "") === key);
        if (found && found.team) return found.team;
    }
    const defaultFound = defaultStandings.find(p => p.driver.trim().toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "") === key);
    if (defaultFound && defaultFound.team) return defaultFound.team;
    return "Independent";
}

function renderAdminDriversTab(filterText = "") {
    if (!adminDriversTableBody) return;
    adminDriversTableBody.innerHTML = "";

    const roster = getOfficialDriverRoster();
    if (adminTabDriversBadge) adminTabDriversBadge.textContent = roster.length;
    if (adminQuickDriversCount) adminQuickDriversCount.textContent = `${roster.length} Pilotos`;

    const selectedTeam = adminFilterTeamSelect ? adminFilterTeamSelect.value.trim().toLowerCase() : "";
    const lowerFilter = (filterText || (adminSearchPilotInput ? adminSearchPilotInput.value : "")).trim().toLowerCase();

    const filtered = roster.filter(r => {
        if (selectedTeam && r.team.toLowerCase() !== selectedTeam) {
            return false;
        }
        if (!lowerFilter) return true;
        const driverMatches = r.driver.toLowerCase().includes(lowerFilter);
        const teamMatches = r.team.toLowerCase().includes(lowerFilter);
        const flag = r.flag || getOfficialDriverFlag(r.driver);
        const countryName = getCountryNameByFlag(flag);
        const countryMatches = countryName.toLowerCase().includes(lowerFilter);
        return driverMatches || teamMatches || countryMatches;
    });

    if (adminPilotTotalCount) {
        if (filtered.length !== roster.length) {
            adminPilotTotalCount.textContent = `${filtered.length} / ${roster.length}`;
        } else {
            adminPilotTotalCount.textContent = roster.length;
        }
    }

    filtered.forEach((item, index) => {
        const actualIndex = roster.indexOf(item);
        const pilotId = item.id || getPilotDocId(item.driver);
        const tr = document.createElement("tr");
        tr.dataset.index = actualIndex;
        tr.dataset.pilotId = pilotId;

        const pendingObj = pendingTeamChanges.get(pilotId) || {};

        const effectiveTeam = pendingObj.team !== undefined
            ? pendingObj.team
            : item.team;

        const effectiveFlag = pendingObj.flag !== undefined
            ? pendingObj.flag
            : (item.flag || getOfficialDriverFlag(item.driver));

        let teamOptions = "";
        F1_TEAMS.forEach(team => {
            const isSelected = effectiveTeam && effectiveTeam.toLowerCase() === team.toLowerCase();
            teamOptions += `<option value="${escapeHtml(team)}" ${isSelected ? "selected" : ""}>${escapeHtml(team)}</option>`;
        });

        const flagName = getCountryNameByFlag(effectiveFlag);
        const flagDisplayVal = effectiveFlag && flagName ? `${effectiveFlag} ${flagName}` : (effectiveFlag || "🏁 Genérico");

        tr.innerHTML = `
            <td style="font-weight: bold; color: var(--gold); text-align: center;">${actualIndex + 1}</td>
            <td style="font-weight: 600; color: #fff;">${escapeHtml(item.driver)}</td>
            <td>
                <input type="text" class="admin-pilot-flag-select admin-select" 
                       list="allCountriesDatalist" 
                       data-pilot-id="${pilotId}" 
                       data-driver="${escapeHtml(item.driver)}" 
                       value="${escapeHtml(flagDisplayVal)}"
                       style="width: 100%;"
                       placeholder="🔍 Buscar país..."
                       autocomplete="off">
            </td>
            <td>
                <select class="admin-pilot-team-select" data-pilot-id="${pilotId}" data-driver="${escapeHtml(item.driver)}">
                    ${teamOptions}
                </select>
            </td>
            <td style="text-align: center;">
                <button type="button" class="admin-remove-btn admin-pilot-remove-btn" data-pilot-id="${pilotId}" data-driver="${escapeHtml(item.driver)}" title="Eliminar piloto de Firestore">🗑</button>
            </td>
        `;

        const teamSelect = tr.querySelector(".admin-pilot-team-select");
        const flagSelect = tr.querySelector(".admin-pilot-flag-select");

        const syncPending = () => {
            pendingTeamChanges.set(pilotId, {
                pilotId,
                driver: item.driver,
                team: teamSelect ? teamSelect.value : effectiveTeam,
                flag: flagSelect ? extractFlagFromCountryString(flagSelect.value) : effectiveFlag
            });
        };

        if (teamSelect) teamSelect.addEventListener("change", syncPending);
        if (flagSelect) {
            flagSelect.addEventListener("change", syncPending);
            flagSelect.addEventListener("input", syncPending);
        }

        adminDriversTableBody.appendChild(tr);
    });

    // Wire remove buttons with Firestore deletion
    adminDriversTableBody.querySelectorAll(".admin-pilot-remove-btn").forEach(btn => {
        btn.addEventListener("click", async () => {
            const pilotId = btn.dataset.pilotId;
            const driverName = btn.dataset.driver;
            if (!pilotId) return;
            const confirmed = await showAppConfirm("Eliminar Piloto", `¿Deseas eliminar a "${driverName}" de la base de datos en Firestore?`, "Eliminar", "Cancelar");
            if (confirmed) {
                try {
                    await deleteDoc(doc(db, "pilotos", pilotId));
                } catch (err) {
                    console.error("Error deleting driver from Firestore:", err);
                }
            }
        });
    });
}

function getAllDriverList() {
    const map = new Map();
    // 1. From official roster
    const roster = getOfficialDriverRoster();
    roster.forEach(r => {
        if (r.driver) map.set(r.driver.trim(), r.team || "Independent");
    });
    // 2. From default standings
    defaultStandings.forEach(d => {
        if (d.driver && !map.has(d.driver.trim())) {
            map.set(d.driver.trim(), d.team || "Independent");
        }
    });
    // 3. From saved standings
    const savedStandings = getSavedStandings();
    savedStandings.forEach(d => {
        if (d.driver && !map.has(d.driver.trim())) {
            map.set(d.driver.trim(), d.team || "Independent");
        }
    });
    // 4. From race results
    Object.values(raceResults).forEach(race => {
        if (race && Array.isArray(race.drivers)) {
            race.drivers.forEach(d => {
                if (d.driver && !map.has(d.driver.trim())) {
                    map.set(d.driver.trim(), d.team || "Independent");
                }
            });
        }
    });

    const list = Array.from(map.entries()).map(([driver, team]) => ({ driver, team }));
    list.sort((a, b) => a.driver.localeCompare(b.driver, undefined, { sensitivity: "base" }));
    return list;
}

function populateDriverSelect(selectEl, selectedDriver, placeholder = "-- Seleccionar Piloto --") {
    if (!selectEl) return;
    const drivers = getAllDriverList();
    selectEl.innerHTML = `<option value="">${placeholder}</option>`;
    
    let matched = false;
    drivers.forEach(d => {
        const opt = document.createElement("option");
        opt.value = d.driver;
        opt.textContent = `${d.driver} (${d.team})`;
        if (selectedDriver && selectedDriver.trim().toLowerCase() === d.driver.toLowerCase()) {
            opt.selected = true;
            matched = true;
        }
        selectEl.appendChild(opt);
    });

    if (selectedDriver && !matched && selectedDriver !== "TBA" && selectedDriver !== "—") {
        const opt = document.createElement("option");
        opt.value = selectedDriver;
        opt.textContent = selectedDriver;
        opt.selected = true;
        selectEl.appendChild(opt);
    }
}

function getDefaultTop10Positions() {
    const standings = getSavedStandings();
    const sorted = sortDriversStandings(standings);
    return sorted.slice(0, 10).map((d, idx) => ({
        pos: idx + 1,
        driver: d.driver,
        team: d.team,
        status: "FINISHED"
    }));
}

// --- Official F1 Points System ---
const F1_POINTS_MAP = {
    1: 25,
    2: 18,
    3: 15,
    4: 12,
    5: 10,
    6: 8,
    7: 6,
    8: 4,
    9: 2,
    10: 1
};
const F1_FASTEST_LAP_PTS = 1;

function normalizeDriverKey(name) {
    if (!name) return "";
    return name.trim().normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
}

function getF1PointsBadgeHtml(pos, status = "FINISHED") {
    if (status === "DSQ") {
        return `<span class="race-pts-tag dsq">0 PTS (DSQ)</span>`;
    }
    const pts = F1_POINTS_MAP[pos] || 0;
    if (pts > 0) {
        return `<span class="race-pts-tag active">+${pts} PTS</span>`;
    }
    return `<span class="race-pts-tag muted">0 PTS</span>`;
}

function renderRacePositionsTable(list) {
    if (!adminRacePositionsBody) return;
    adminRacePositionsBody.innerHTML = "";

    if (!Array.isArray(list) || list.length === 0) {
        const emptyTr = document.createElement("tr");
        emptyTr.className = "race-pos-empty-row";
        emptyTr.innerHTML = `
            <td colspan="6" style="text-align: center; color: #8c929c; padding: 26px 16px; font-size: 13.5px;">
                <div style="display: flex; flex-direction: column; align-items: center; gap: 8px;">
                    <span style="color: #d1d6e0; font-weight: 700; font-size: 14px;">🏁 No hay resultados registrados para este Gran Premio</span>
                    <span style="font-size: 12.5px; color: #788190;">Haz clic en <strong>«+ Añadir Posición»</strong> o en <strong>«Cargar Top 10»</strong> para registrar el orden de llegada.</span>
                </div>
            </td>
        `;
        adminRacePositionsBody.appendChild(emptyTr);
        return;
    }

    const driverList = getAllDriverList();

    list.forEach((item, idx) => {
        const tr = document.createElement("tr");
        tr.className = "race-pos-row";

        let driverOptions = `<option value="">-- Seleccionar Piloto --</option>`;
        driverList.forEach(d => {
            const isSelected = item.driver && item.driver.toLowerCase() === d.driver.toLowerCase();
            driverOptions += `<option value="${escapeHtml(d.driver)}" ${isSelected ? "selected" : ""}>${escapeHtml(d.driver)}</option>`;
        });
        if (item.driver && !driverList.some(d => d.driver.toLowerCase() === item.driver.toLowerCase())) {
            driverOptions += `<option value="${escapeHtml(item.driver)}" selected>${escapeHtml(item.driver)}</option>`;
        }

        const initialTeam = item.driver ? getDriverTeam(item.driver) : (item.team || "Independent");

        const statuses = ["FINISHED", "DNF", "DNS", "DSQ"];
        let statusOptions = "";
        statuses.forEach(st => {
            const isSelected = (item.status || "FINISHED") === st;
            statusOptions += `<option value="${st}" ${isSelected ? "selected" : ""}>${st}</option>`;
        });

        const statusVal = item.status || "FINISHED";

        tr.innerHTML = `
            <td class="pos-cell" style="font-weight: 800; color: var(--gold); text-align: center;">${idx + 1}</td>
            <td>
                <select class="race-driver-select" required>
                    ${driverOptions}
                </select>
            </td>
            <td>
                <div class="race-team-lock-box">
                    <span class="team-locked-badge ${getTeamClass(initialTeam)}" title="Equipo oficial bloqueado">${escapeHtml(initialTeam)}</span>
                    <input type="hidden" class="race-team-val" value="${escapeHtml(initialTeam)}">
                </div>
            </td>
            <td>
                <select class="race-status-select">
                    ${statusOptions}
                </select>
            </td>
            <td class="race-pos-pts-cell" style="text-align: center;">
                ${getF1PointsBadgeHtml(idx + 1, statusVal)}
            </td>
            <td style="text-align: center;">
                <button type="button" class="admin-remove-btn race-pos-remove-btn" title="Eliminar posición">🗑</button>
            </td>
        `;

        const driverSelect = tr.querySelector(".race-driver-select");
        const teamBadge = tr.querySelector(".team-locked-badge");
        const teamVal = tr.querySelector(".race-team-val");
        const statusSelect = tr.querySelector(".race-status-select");
        const ptsCell = tr.querySelector(".race-pos-pts-cell");

        driverSelect.addEventListener("change", () => {
            const val = driverSelect.value;
            const officialTeam = getDriverTeam(val);
            if (teamBadge && teamVal) {
                teamBadge.textContent = officialTeam;
                teamBadge.className = `team-locked-badge ${getTeamClass(officialTeam)}`;
                teamVal.value = officialTeam;
            }
        });

        statusSelect.addEventListener("change", () => {
            const currentPos = parseInt(tr.querySelector(".pos-cell").textContent, 10) || (idx + 1);
            if (ptsCell) {
                ptsCell.innerHTML = getF1PointsBadgeHtml(currentPos, statusSelect.value);
            }
        });

        tr.querySelector(".race-pos-remove-btn").addEventListener("click", () => {
            tr.remove();
            reindexRacePositions();
        });

        adminRacePositionsBody.appendChild(tr);
    });
}

function reindexRacePositions() {
    if (!adminRacePositionsBody) return;
    const rows = adminRacePositionsBody.querySelectorAll("tr.race-pos-row");
    if (rows.length === 0) {
        renderRacePositionsTable([]);
        return;
    }
    rows.forEach((row, idx) => {
        const cell = row.querySelector(".pos-cell");
        if (cell) cell.textContent = idx + 1;
        const statusSelect = row.querySelector(".race-status-select");
        const ptsCell = row.querySelector(".race-pos-pts-cell");
        if (ptsCell) {
            const st = statusSelect ? statusSelect.value : "FINISHED";
            ptsCell.innerHTML = getF1PointsBadgeHtml(idx + 1, st);
        }
    });
}

function populateRaceResultsEditor(raceKey) {
    if (!raceKey) raceKey = "australia";
    const race = raceResults[raceKey] || seasonRacesMeta[raceKey] || {
        round: "ROUND",
        title: raceKey.toUpperCase(),
        location: "",
        date: "TBA",
        status: "UPCOMING",
        winner: "TBA",
        pole: "TBA",
        fastest: "TBA",
        driverDay: "TBA",
        drivers: []
    };

    // Update Race Status Controls & Badges
    const completed = isRaceFinished(race);
    if (adminRaceStatusSelect) {
        adminRaceStatusSelect.value = completed ? "COMPLETED" : "UPCOMING";
    }
    if (adminRaceStatusBadge) {
        adminRaceStatusBadge.className = `admin-status-pill ${completed ? "status-completed" : "status-upcoming"}`;
        adminRaceStatusBadge.textContent = completed ? "🏁 FINALIZADA / ACABADA" : "⏳ PRÓXIMA / PENDIENTE";
    }
    if (adminToggleRaceStatusBtnLabel) {
        adminToggleRaceStatusBtnLabel.textContent = completed ? "Marcar como Pendiente" : "Marcar como Acabada";
    }
    if (adminToggleRaceStatusBtn) {
        adminToggleRaceStatusBtn.className = completed ? "btn btn-secondary btn-sm" : "btn btn-primary btn-sm";
    }

    // Fastest Lap (Vuelta Rápida)
    let fastestDriver = "";
    let fastestTime = "";
    if (race.fastest && race.fastest !== "TBA") {
        if (race.fastest.includes(" · ")) {
            const parts = race.fastest.split(" · ");
            fastestDriver = parts[0].trim();
            fastestTime = parts[1].trim();
        } else {
            fastestDriver = race.fastest.trim();
        }
    }
    populateDriverSelect(adminFastestDriver, fastestDriver, "-- Seleccionar Piloto con Vuelta Rápida --");
    if (adminFastestTime) adminFastestTime.value = fastestTime;

    // Pole
    let poleDriver = "";
    let poleTime = "";
    if (race.pole && race.pole !== "TBA") {
        if (race.pole.includes(" · ")) {
            const parts = race.pole.split(" · ");
            poleDriver = parts[0].trim();
            poleTime = parts[1].trim();
        } else {
            poleDriver = race.pole.trim();
        }
    }
    populateDriverSelect(adminPoleDriver, poleDriver, "-- Seleccionar Piloto en Pole --");
    if (adminPoleTime) adminPoleTime.value = poleTime;

    // Driver of the Day
    const driverDayVal = (race.driverDay && race.driverDay !== "TBA") ? race.driverDay : "";
    populateDriverSelect(adminDriverDay, driverDayVal, "-- Seleccionar Piloto del Día --");

    // Race Date & Replay URL
    if (adminRaceDateInput) adminRaceDateInput.value = (race.date && race.date !== "TBA") ? race.date : (seasonRacesMeta[raceKey]?.date || "");
    if (adminRaceReplayUrl) adminRaceReplayUrl.value = race.replayUrl || "";

    // Position rows: if race has drivers, render them; otherwise render empty table state
    const driversToRender = Array.isArray(race.drivers) && race.drivers.length > 0 ? race.drivers : [];
    renderRacePositionsTable(driversToRender);
}

// Official GP Presets Map for Quick Loader
const OFFICIAL_GP_PRESETS = {
    australia: { round: "ROUND 01", title: "AUSTRALIAN GP", location: "MELBOURNE · ALBERT PARK", dateText: "14 JUN · 16:30 CEST", dateTime: "2026-06-14T16:30", weatherTemp: "24°C", weatherCondition: "sunny" },
    malaysia: { round: "ROUND 02", title: "MALAYSIAN GP", location: "SEPANG · KUALA LUMPUR", dateText: "28 JUN · 16:30 CEST", dateTime: "2026-06-28T16:30", weatherTemp: "31°C", weatherCondition: "partly-cloudy" },
    bahrain: { round: "ROUND 03", title: "BAHRAIN GP", location: "SAKHIR · DESERT CIRCUIT", dateText: "12 JUL · 16:30 CEST", dateTime: "2026-07-12T16:30", weatherTemp: "28°C", weatherCondition: "sunny" },
    turkey: { round: "ROUND 04", title: "TURKISH GP", location: "ISTANBUL PARK · TURKEY", dateText: "19 JUL · 16:30 CEST", dateTime: "2026-07-19T16:30", weatherTemp: "25°C", weatherCondition: "sunny" },
    spain: { round: "ROUND 05", title: "SPANISH GP", location: "CIRCUIT DE BARCELONA-CATALUNYA", dateText: "09 AUG · 16:30 CEST", dateTime: "2026-08-09T16:30", weatherTemp: "23°C", weatherCondition: "sunny" },
    italy: { round: "ROUND 06", title: "ITALIAN GP", location: "AUTODROMO NAZIONALE MONZA", dateText: "17 AUG · 16:30 CEST", dateTime: "2026-08-17T16:30", weatherTemp: "26°C", weatherCondition: "sunny" },
    austria: { round: "ROUND 07", title: "AUSTRIAN GP", location: "RED BULL RING · SPIELBERG", dateText: "23 AUG · 16:30 CEST", dateTime: "2026-08-23T16:30", weatherTemp: "21°C", weatherCondition: "partly-cloudy" },
    silverstone: { round: "ROUND 08", title: "BRITISH GP", location: "SILVERSTONE CIRCUIT · UK", dateText: "07 SEP · 16:30 CEST", dateTime: "2026-09-07T16:30", weatherTemp: "19°C", weatherCondition: "cloudy" },
    hockenheim: { round: "ROUND 09", title: "GERMAN GP", location: "HOCKENHEIMRING · GERMANY", dateText: "13 SEP · 16:30 CEST", dateTime: "2026-09-13T16:30", weatherTemp: "24°C", weatherCondition: "sunny" },
    nurburgring: { round: "ROUND 10", title: "NÜRBURGRING GP", location: "NÜRBURGRING · EUROPE", dateText: "20 SEP · 16:30 CEST", dateTime: "2026-09-20T16:30", weatherTemp: "22°C", weatherCondition: "sunny" },
    hungary: { round: "ROUND 11", title: "HUNGARIAN GP", location: "HUNGARORING · BUDAPEST", dateText: "27 SEP · 16:30 CEST", dateTime: "2026-09-27T16:30", weatherTemp: "29°C", weatherCondition: "sunny" },
    belgium: { round: "ROUND 12", title: "BELGIAN GP", location: "CIRCUIT DE SPA-FRANCORCHAMPS", dateText: "04 OCT · 16:30 CEST", dateTime: "2026-10-04T16:30", weatherTemp: "18°C", weatherCondition: "rainy" },
    singapore: { round: "ROUND 13", title: "SINGAPORE GP", location: "MARINA BAY STREET CIRCUIT", dateText: "11 OCT · 20:00 CEST", dateTime: "2026-10-11T20:00", weatherTemp: "30°C", weatherCondition: "partly-cloudy" },
    cota: { round: "ROUND 14", title: "UNITED STATES GP", location: "CIRCUIT OF THE AMERICAS · AUSTIN", dateText: "18 OCT · 20:00 CEST", dateTime: "2026-10-18T20:00", weatherTemp: "27°C", weatherCondition: "sunny" },
    brazil: { round: "ROUND 15", title: "BRAZILIAN GP", location: "AUTÓDROMO JOSÉ CARLOS PACE · INTERLAGOS", dateText: "25 OCT · 18:00 CEST", dateTime: "2026-10-25T18:00", weatherTemp: "25°C", weatherCondition: "rainy" }
};

// Update Admin Live Preview replica in real-time
function updateAdminLivePreview() {
    const roundVal = adminRaceRound ? adminRaceRound.value.trim() : "";
    const titleVal = adminRaceTitle ? adminRaceTitle.value.trim() : "";
    const locVal = adminRaceLocation ? adminRaceLocation.value.trim() : "";
    const dateVal = adminRaceDateText ? adminRaceDateText.value.trim() : "";
    let tempVal = adminRaceTemp ? adminRaceTemp.value.trim() : "22°C";
    if (tempVal && !tempVal.includes("°")) tempVal += "°C";
    const weatherVal = adminRaceWeather ? adminRaceWeather.value : "sunny";
    const isTbd = Boolean(adminRaceIsTbd && adminRaceIsTbd.checked) || 
                  (dateVal && (dateVal.toUpperCase().includes("TBD") || dateVal.toUpperCase().includes("TBA") || dateVal.toUpperCase().includes("POR DETERMINAR") || dateVal.toUpperCase().includes("POR CONFIRMAR")));

    if (previewMockRound) previewMockRound.textContent = roundVal || "ROUND 10";
    if (previewMockTitle) previewMockTitle.textContent = titleVal || "GRAN PREMIO";
    if (previewMockLocation) previewMockLocation.textContent = locVal || "CIRCUITO · PAÍS";
    if (previewMockDateText) {
        if (isTbd) {
            previewMockDateText.textContent = dateVal || "TBD · POR DETERMINAR";
            previewMockDateText.style.color = "var(--gold-light, #f1d78a)";
        } else {
            previewMockDateText.textContent = dateVal || "PRÓXIMAMENTE";
            previewMockDateText.style.color = "#e2e8f0";
        }
    }

    const countdownTag = document.querySelector(".admin-preview-countdown-tag");
    if (countdownTag) {
        if (isTbd) {
            countdownTag.innerHTML = `<span class="admin-preview-dot" style="background:var(--gold, #d4af37);"></span> Fecha por Confirmar (TBD)`;
            countdownTag.style.color = "var(--gold-light, #f1d78a)";
            countdownTag.style.background = "rgba(212, 175, 55, 0.12)";
        } else {
            countdownTag.innerHTML = `<span class="admin-preview-dot" style="background:#3fb950;"></span> Cuenta Regresiva Activa`;
            countdownTag.style.color = "#3fb950";
            countdownTag.style.background = "rgba(63, 185, 80, 0.1)";
        }
    }

    let icon = "☀️";
    if (weatherVal === "partly-cloudy") icon = "⛅";
    else if (weatherVal === "cloudy") icon = "☁️";
    else if (weatherVal === "rainy") icon = "🌧️";
    else if (weatherVal === "storm") icon = "🌩️";

    if (previewMockWeatherIcon) previewMockWeatherIcon.textContent = icon;
    if (previewMockWeatherTemp) previewMockWeatherTemp.textContent = tempVal;

    // Synchronize Quick KPI Operations Bar
    if (adminQuickNextRace) {
        if (roundVal && titleVal) {
            adminQuickNextRace.textContent = `${roundVal}: ${titleVal}${isTbd ? " (TBD)" : ""}`;
        } else {
            adminQuickNextRace.textContent = roundVal || titleVal || "RACE PREP";
        }
    }
}

// Populate Admin Forms from current stored states
function populateAdminForms() {
    const race = getSavedNextRace();
    const isTbd = isNextRaceTbd(race);

    if (adminRaceRound) adminRaceRound.value = race.round || "";
    if (adminRaceTitle) adminRaceTitle.value = race.title || "";
    if (adminRaceLocation) adminRaceLocation.value = race.location || "";
    if (adminRaceDateText) adminRaceDateText.value = race.dateText || (isTbd ? "TBD · Por Determinar" : "");
    if (adminRaceTemp) adminRaceTemp.value = race.weatherTemp || "22°C";
    if (adminRaceWeather) adminRaceWeather.value = race.weatherCondition || "sunny";
    
    if (adminRaceIsTbd) {
        adminRaceIsTbd.checked = isTbd;
    }
    if (adminRaceDateTime) {
        adminRaceDateTime.value = (!isTbd && race.dateTime && race.dateTime !== "TBD" && race.dateTime !== "TBA") ? race.dateTime : "";
        adminRaceDateTime.disabled = isTbd;
        adminRaceDateTime.required = !isTbd;
    }
    if (adminRaceDateTimeHint) {
        adminRaceDateTimeHint.textContent = isTbd 
            ? "Fecha por determinar (TBD). El contador en vivo mostrará estado por confirmar."
            : "Ajusta la fecha y hora oficial para que el contador en vivo sincronice automáticamente.";
    }

    // Sync Live Preview immediately
    updateAdminLivePreview();

    const standings = getSavedStandings();
    renderAdminStandingsEditor(standings);

    const settings = getSavedSettings();
    const isLive = Boolean(settings.liveMode);
    if (adminLiveMode) {
        adminLiveMode.checked = isLive;
    }
    if (adminSwitchStatusText) {
        adminSwitchStatusText.textContent = isLive ? "MODO DIRECTO ACTIVADO" : "MODO DIRECTO DESACTIVADO";
        adminSwitchStatusText.classList.toggle("is-active", isLive);
    }
    if (adminQuickLiveStatus) {
        adminQuickLiveStatus.textContent = isLive ? "🔴 EN DIRECTO" : "OFFLINE";
        adminQuickLiveStatus.style.color = isLive ? "#f85149" : "#8c929c";
    }

    if (adminTwitchChannel) adminTwitchChannel.value = settings.twitchChannel || "https://www.twitch.tv/driezzz12";
    if (adminLiveTitle) adminLiveTitle.value = settings.liveTitle || "ESTAMOS EN DIRECTO";
    if (adminLiveRaceTitle) adminLiveRaceTitle.value = settings.liveRaceTitle || "";
    if (adminLiveSubtitle) adminLiveSubtitle.value = settings.liveSubtitle || "Sigue la retransmisión oficial de la carrera en vivo por Twitch.";
    if (adminDiscordUrl) adminDiscordUrl.value = settings.discordUrl || "";
    if (adminXUrl) adminXUrl.value = settings.xUrl || "";
    if (adminInstagramUrl) adminInstagramUrl.value = settings.instagramUrl || "";
    if (adminStatSeason) adminStatSeason.value = settings.season || "";
    if (adminStatRounds) adminStatRounds.value = settings.rounds || "";
    if (adminStatDrivers) adminStatDrivers.value = settings.drivers || "";

    const isFantasyLocked = Boolean(settings.fantasyLocked);
    if (adminFantasyLocked) {
        adminFantasyLocked.checked = isFantasyLocked;
    }
    if (adminFantasyLockStatusText) {
        adminFantasyLockStatusText.textContent = isFantasyLocked ? "🔒 MERCADO BLOQUEADO (CARRERA EN CURSO)" : "MERCADO ABIERTO (FICHAJES ACTIVOS)";
        adminFantasyLockStatusText.classList.toggle("is-active", isFantasyLocked);
    }
    if (adminQuickFantasyStatus) {
        adminQuickFantasyStatus.textContent = isFantasyLocked ? "🔒 BLOQUEADO" : "⚡ ABIERTO";
        adminQuickFantasyStatus.style.color = isFantasyLocked ? "var(--gold-light)" : "#3fb950";
    }

    if (adminFantasyLockMessage) {
        adminFantasyLockMessage.value = settings.fantasyLockMessage || "Mercado de fichajes congelado por Gran Premio en curso.";
    }

    if (adminFantasyFluctuation) {
        adminFantasyFluctuation.checked = (settings.fantasyFluctuationEnabled !== false);
    }
    if (adminFantasyFluctuationStatusText) {
        const isFluct = (settings.fantasyFluctuationEnabled !== false);
        adminFantasyFluctuationStatusText.textContent = isFluct ? "FLUCTUACIÓN DINÁMICA ACTIVADA" : "PRECIOS ESTÁTICOS BASE";
        adminFantasyFluctuationStatusText.classList.toggle("is-active", isFluct);
    }
    if (adminFantasyVolatility) {
        adminFantasyVolatility.value = String(settings.fantasyVolatilityMultiplier || 1.0);
    }

    if (typeof renderAdminMarketSentimentWidget === "function") {
        renderAdminMarketSentimentWidget();
    }

    renderAdminDriversTab();
    if (typeof refreshAdminVerificationData === "function") {
        refreshAdminVerificationData();
    } else if (typeof renderAdminVerifyTab === "function") {
        renderAdminVerifyTab();
    }

    if (adminSelectRace) {
        populateRaceResultsEditor(adminSelectRace.value || "australia");
    }
}

// --- Firestore Real-Time Synchronizers ---
function initFirestoreListeners() {
    // 1. Synchronize 'pilotos' collection in real-time
    onSnapshot(collection(db, "pilotos"), async (snapshot) => {
        if (snapshot.empty && !isPilotosInitialLoaded) {
            isPilotosInitialLoaded = true;
            try {
                const batch = writeBatch(db);
                defaultStandings.forEach(d => {
                    const docRef = doc(db, "pilotos", getPilotDocId(d.driver));
                    batch.set(docRef, {
                        driver: d.driver,
                        team: d.team,
                        pos: d.pos,
                        pts: Number(d.pts) || 0
                    });
                });
                await batch.commit();
            } catch (err) {
                console.error("Error auto-seeding 'pilotos' into Firestore:", err);
            }
            return;
        }

        isPilotosInitialLoaded = true;
        const driverMap = new Map();
        let hasCorruptedPilot = false;
        let dieguioskFound = false;
        let rikidorsaFound = false;

        snapshot.forEach(docSnap => {
            const data = docSnap.data();
            const pId = docSnap.id.toLowerCase();
            const dName = data.driver || docSnap.id;
            const norm = normalizeDriverKey(dName);
            if (pId === "dlegulosk" || dName.toLowerCase() === "dlegulosk" || pId === "rikiorsa" || dName.toLowerCase() === "rikiorsa") {
                hasCorruptedPilot = true;
            }
            if (pId === "dieguiosk" || norm === "dieguiosk") {
                dieguioskFound = true;
            }
            if (pId === "rikidorsa" || norm === "rikidorsa") {
                rikidorsaFound = true;
            }

            // Cross-check with global verified users map
            const verifiedUserInfo = (typeof window !== "undefined" && window.globalVerifiedUsersMap) ? window.globalVerifiedUsersMap.get(norm) : null;
            const isVerifiedDriver = Boolean(data.isVerified || data.claimedByEmail || data.claimedByUid || (verifiedUserInfo && verifiedUserInfo.isVerified));
            const claimedEmail = data.claimedByEmail || (verifiedUserInfo ? verifiedUserInfo.email : null);
            const claimedUid = data.claimedByUid || (verifiedUserInfo ? verifiedUserInfo.uid : null);

            const resolvedFlag = data.flag || data.customFlag || (verifiedUserInfo ? verifiedUserInfo.customFlag : null) || getOfficialDriverFlag(dName);
            if (data.flag || data.customFlag) {
                savePersistentDriverFlag(dName, data.flag || data.customFlag);
            }

            driverMap.set(norm, {
                id: docSnap.id,
                driver: data.driver || docSnap.id,
                team: data.team || "Independent",
                pos: data.pos || getOfficialDriverRank(data.driver || docSnap.id),
                pts: Number(data.pts) || 0,
                verificationCode: data.verificationCode || null,
                claimedByEmail: claimedEmail,
                claimedByUid: claimedUid,
                isVerified: isVerifiedDriver,
                avatarUrl: data.avatarUrl || (verifiedUserInfo ? verifiedUserInfo.avatarUrl : null),
                cardColor: data.cardColor || (verifiedUserInfo ? verifiedUserInfo.cardColor : null),
                flag: resolvedFlag,
                customFlag: resolvedFlag,
                bio: data.bio || (verifiedUserInfo ? verifiedUserInfo.bio : null),
                socialTwitch: data.socialTwitch || (verifiedUserInfo ? verifiedUserInfo.socialTwitch : null),
                socialYoutube: data.socialYoutube || (verifiedUserInfo ? verifiedUserInfo.socialYoutube : null),
                socialTwitter: data.socialTwitter || (verifiedUserInfo ? verifiedUserInfo.socialTwitter : null),
                socialDiscord: data.socialDiscord || (verifiedUserInfo ? verifiedUserInfo.socialDiscord : null)
            });
        });

        const list = Array.from(driverMap.values());

        // Clean corrupted legacy pilot IDs if present
        if (hasCorruptedPilot) {
            try {
                const batch = writeBatch(db);
                batch.delete(doc(db, "pilotos", "dlegulosk"));
                batch.delete(doc(db, "pilotos", "rikiorsa"));
                await batch.commit();
            } catch (err) {
                console.error("Error cleaning legacy pilot IDs from Firestore:", err);
            }
        }

        currentPilotos = sortDriversStandings(list);

        if (typeof syncUserClaimWithPilotos === "function") {
            syncUserClaimWithPilotos();
        }

        renderStandingsOnPage(currentPilotos);
        if (typeof updateStandingsToggleUI === "function") {
            updateStandingsToggleUI(currentPilotos.length);
        }

        // Automatically update fantasy prices and fantasy scores when driver points change
        if (typeof updateFantasyWithNewStandings === "function") {
            updateFantasyWithNewStandings();
        }

        if (adminPanelOverlay && adminPanelOverlay.classList.contains("active")) {
            renderAdminStandingsEditor(currentPilotos);
            renderAdminDriversTab(adminSearchPilotInput ? adminSearchPilotInput.value : "");
            if (typeof renderAdminVerifyTab === "function") renderAdminVerifyTab(typeof adminSearchVerifyPilotInput !== "undefined" && adminSearchVerifyPilotInput ? adminSearchVerifyPilotInput.value : "");
            if (adminSelectRace) populateRaceResultsEditor(adminSelectRace.value);
        }
    }, (error) => {
        console.error("Error subscribing to 'pilotos' collection:", error);
    });

    // 2. Synchronize next race in real-time from configuracion/proxima_carrera
    onSnapshot(doc(db, "configuracion", "proxima_carrera"), async (docSnap) => {
        if (docSnap.exists()) {
            currentNextRace = docSnap.data();
            renderNextRaceOnPage(currentNextRace);
            if (adminPanelOverlay && adminPanelOverlay.classList.contains("active")) {
                const isTbd = isNextRaceTbd(currentNextRace);
                if (adminRaceRound) adminRaceRound.value = currentNextRace.round || "";
                if (adminRaceTitle) adminRaceTitle.value = currentNextRace.title || "";
                if (adminRaceLocation) adminRaceLocation.value = currentNextRace.location || "";
                if (adminRaceDateText) adminRaceDateText.value = currentNextRace.dateText || (isTbd ? "TBD · Por Determinar" : "");
                if (adminRaceTemp) adminRaceTemp.value = currentNextRace.weatherTemp || "22°C";
                if (adminRaceWeather) adminRaceWeather.value = currentNextRace.weatherCondition || "sunny";
                if (adminRaceIsTbd) adminRaceIsTbd.checked = isTbd;
                if (adminRaceDateTime) {
                    adminRaceDateTime.value = (!isTbd && currentNextRace.dateTime && currentNextRace.dateTime !== "TBD" && currentNextRace.dateTime !== "TBA") ? currentNextRace.dateTime : "";
                    adminRaceDateTime.disabled = isTbd;
                    adminRaceDateTime.required = !isTbd;
                }
                if (adminRaceDateTimeHint) {
                    adminRaceDateTimeHint.textContent = isTbd 
                        ? "Fecha por determinar (TBD). El contador en vivo mostrará estado por confirmar."
                        : "Ajusta la fecha y hora oficial para que el contador en vivo sincronice automáticamente.";
                }
                updateAdminLivePreview();
            }
        } else {
            try {
                await setDoc(doc(db, "configuracion", "proxima_carrera"), defaultNextRace);
            } catch (err) {
                console.error("Error creating default next race in Firestore:", err);
            }
        }
    }, (error) => {
        console.error("Error subscribing to 'proxima_carrera':", error);
    });

    // 3. Synchronize general settings in real-time from configuracion/general
    onSnapshot(doc(db, "configuracion", "general"), async (docSnap) => {
        if (docSnap.exists()) {
            currentSettings = docSnap.data();
            renderSettingsOnPage(currentSettings);
            if (adminPanelOverlay && adminPanelOverlay.classList.contains("active")) {
                if (adminLiveMode) {
                    adminLiveMode.checked = Boolean(currentSettings.liveMode);
                }
                if (adminSwitchStatusText) {
                    const isLive = Boolean(currentSettings.liveMode);
                    adminSwitchStatusText.textContent = isLive ? "MODO DIRECTO ACTIVADO" : "MODO DIRECTO DESACTIVADO";
                    adminSwitchStatusText.classList.toggle("is-active", isLive);
                }
                if (adminTwitchChannel) adminTwitchChannel.value = currentSettings.twitchChannel || "https://www.twitch.tv/driezzz12";
                if (adminLiveTitle) adminLiveTitle.value = currentSettings.liveTitle || "ESTAMOS EN DIRECTO";
                if (adminLiveRaceTitle) adminLiveRaceTitle.value = currentSettings.liveRaceTitle || "";
                if (adminLiveSubtitle) adminLiveSubtitle.value = currentSettings.liveSubtitle || "Sigue la retransmisión oficial de la carrera en vivo por Twitch.";
                if (adminDiscordUrl) adminDiscordUrl.value = currentSettings.discordUrl || "";
                if (adminXUrl) adminXUrl.value = currentSettings.xUrl || "";
                if (adminInstagramUrl) adminInstagramUrl.value = currentSettings.instagramUrl || "";
                if (adminStatSeason) adminStatSeason.value = currentSettings.season || "";
                if (adminStatRounds) adminStatRounds.value = currentSettings.rounds || "";
                if (adminStatDrivers) adminStatDrivers.value = currentSettings.drivers || "";
                if (adminFantasyLocked) {
                    adminFantasyLocked.checked = Boolean(currentSettings.fantasyLocked);
                }
                if (adminFantasyLockStatusText) {
                    const isFantasyLocked = Boolean(currentSettings.fantasyLocked);
                    adminFantasyLockStatusText.textContent = isFantasyLocked ? "🔒 MERCADO BLOQUEADO (CARRERA EN CURSO)" : "MERCADO ABIERTO (FICHAJES ACTIVOS)";
                    adminFantasyLockStatusText.classList.toggle("is-active", isFantasyLocked);
                }
                if (adminFantasyLockMessage && document.activeElement !== adminFantasyLockMessage) {
                    adminFantasyLockMessage.value = currentSettings.fantasyLockMessage || "Mercado de fichajes congelado por Gran Premio en curso.";
                }
                if (adminFantasyFluctuation) {
                    adminFantasyFluctuation.checked = (currentSettings.fantasyFluctuationEnabled !== false);
                }
                if (adminFantasyFluctuationStatusText) {
                    const isFluct = (currentSettings.fantasyFluctuationEnabled !== false);
                    adminFantasyFluctuationStatusText.textContent = isFluct ? "FLUCTUACIÓN DINÁMICA ACTIVADA" : "PRECIOS ESTÁTICOS BASE";
                    adminFantasyFluctuationStatusText.classList.toggle("is-active", isFluct);
                }
                if (adminFantasyVolatility && document.activeElement !== adminFantasyVolatility) {
                    adminFantasyVolatility.value = String(currentSettings.fantasyVolatilityMultiplier || 1.0);
                }
                if (typeof renderAdminMarketSentimentWidget === "function") {
                    renderAdminMarketSentimentWidget();
                }
            }
        } else {
            try {
                await setDoc(doc(db, "configuracion", "general"), defaultSettings);
            } catch (err) {
                console.error("Error creating default settings in Firestore:", err);
            }
        }
    }, (error) => {
        console.error("Error subscribing to 'general' settings:", error);
    });

    // 4. Synchronize race results from carreras collection in real time
    onSnapshot(collection(db, "carreras"), async (snapshot) => {
        isCarrerasInitialLoaded = true;
        const existingKeys = new Set();
        let hasLegacyRaceData = false;

        snapshot.forEach(docSnap => {
            existingKeys.add(docSnap.id);
            const rData = docSnap.data();
            raceResults[docSnap.id] = rData;

            if (rData.winner === "Dlegulosk" || (rData.drivers && rData.drivers.some(d => d.driver === "Dlegulosk" || d.driver === "RikiORSA" || d.driver === "Ted Theo"))) {
                hasLegacyRaceData = true;
            }
        });

        // Refresh all calendar cards based on current race progression
        refreshAllCalendarCards();

        // Ensure ALL 15 calendar races exist in Firestore
        const missingKeys = Object.keys(defaultRaceResults).filter(k => !existingKeys.has(k));
        if (missingKeys.length > 0 || hasLegacyRaceData) {
            try {
                const batch = writeBatch(db);
                Object.keys(defaultRaceResults).forEach(key => {
                    if (missingKeys.includes(key) || hasLegacyRaceData) {
                        const docRef = doc(db, "carreras", key);
                        batch.set(docRef, defaultRaceResults[key]);
                    }
                });
                await batch.commit();
            } catch (err) {
                console.error("Error updating races in Firestore:", err);
            }
        }

        if (currentOpenRaceKey && raceResults[currentOpenRaceKey] && raceOverlay && raceOverlay.classList.contains("active")) {
            openRace(currentOpenRaceKey);
        }
        if (adminPanelOverlay && adminPanelOverlay.classList.contains("active") && adminSelectRace) {
            populateRaceResultsEditor(adminSelectRace.value);
        }

        // Automatically recalculate standings from all completed races (including Nürburgring and onwards)
        const hasCompletedRaces = Object.values(raceResults).some(r => r && (r.status === "COMPLETED" || (r.winner && r.winner !== "TBA")));
        if (hasCompletedRaces) {
            const updatedStandings = calculateAllStandingsFromRaces(raceResults, currentPilotos);
            currentPilotos = updatedStandings;
            renderStandingsOnPage(currentPilotos);
            if (typeof updateStandingsToggleUI === "function") {
                updateStandingsToggleUI(currentPilotos.length);
            }
        }

        // Keep season matrix spreadsheet and driver modal synchronized with latest race results
        renderFfcMatrixTable();
        if (currentOpenModalDriver) {
            const overlay = document.getElementById("driverModalOverlay");
            if (overlay && overlay.classList.contains("active")) {
                openDriverStatsModal(currentOpenModalDriver);
            }
        }

        // Automatically update fantasy prices and fantasy scores when race results change
        if (typeof updateFantasyWithNewStandings === "function") {
            updateFantasyWithNewStandings();
        }
    }, (error) => {
        console.error("Error subscribing to 'carreras' collection:", error);
    });

    // 4. Synchronize 'usuarios' collection in real-time for verified drivers & claimed accounts
    onSnapshot(collection(db, "usuarios"), (snapshot) => {
        if (!snapshot || snapshot.empty) return;
        if (typeof window !== "undefined") {
            if (!window.globalVerifiedUsersMap) window.globalVerifiedUsersMap = new Map();
        }

        snapshot.forEach(docSnap => {
            const uData = docSnap.data();
            if (uData && (uData.isVerified || uData.claimedDriver)) {
                const driverName = uData.claimedDriver || (uData.isVerified ? (uData.displayName || docSnap.id) : null);
                if (driverName) {
                    const norm = normalizeDriverKey(driverName);
                    if (typeof window !== "undefined" && window.globalVerifiedUsersMap) {
                        window.globalVerifiedUsersMap.set(norm, {
                            driver: driverName,
                            email: uData.email || null,
                            uid: uData.uid || docSnap.id,
                            isVerified: uData.isVerified !== false,
                            verifiedAt: uData.verifiedAt || null,
                            avatarUrl: uData.avatarUrl || null,
                            cardColor: uData.cardColor || null,
                            customFlag: uData.customFlag || uData.flag || null,
                            bio: uData.bio || null,
                            socialTwitch: uData.socialTwitch || null,
                            socialYoutube: uData.socialYoutube || null,
                            socialTwitter: uData.socialTwitter || null,
                            socialDiscord: uData.socialDiscord || null
                        });
                    }
                }
            }
        });

        // Update currentPilotos if loaded
        if (Array.isArray(currentPilotos) && currentPilotos.length > 0) {
            let changed = false;
            currentPilotos.forEach(p => {
                const norm = normalizeDriverKey(p.driver);
                if (typeof window !== "undefined" && window.globalVerifiedUsersMap && window.globalVerifiedUsersMap.has(norm)) {
                    const uInfo = window.globalVerifiedUsersMap.get(norm);
                    if (!p.isVerified || !p.claimedByEmail) {
                        p.isVerified = true;
                        if (uInfo.email && !p.claimedByEmail) p.claimedByEmail = uInfo.email;
                        if (uInfo.uid && !p.claimedByUid) p.claimedByUid = uInfo.uid;
                        changed = true;
                    }
                }
            });
            if (changed) {
                renderStandingsOnPage(currentPilotos);
            }
        }

        // Re-render admin verify tab if admin panel is open
        if (adminPanelOverlay && adminPanelOverlay.classList.contains("active")) {
            if (typeof renderAdminVerifyTab === "function") {
                renderAdminVerifyTab(typeof adminSearchVerifyPilotInput !== "undefined" && adminSearchVerifyPilotInput ? adminSearchVerifyPilotInput.value : "");
            }
        }
    }, (error) => {
        console.warn("Notice: Real-time sync on 'usuarios' collection:", error);
    });
}

// Initialize on page load
(function initializeSavedData() {
    renderNextRaceOnPage(getSavedNextRace());
    renderStandingsOnPage(getSavedStandings());
    renderSettingsOnPage(getSavedSettings());
    initRaceResults();

    // Start real-time Firestore synchronization
    initFirestoreListeners();

    // Initialize custom dropdowns (Language & Timezone)
    initCustomDropdowns();
    renderTimezoneOptions();

    // Initialize Matrix Spreadsheet, View Tabs and Driver Stats Modal
    initStandingsViewTabs();
    initDriverStatsModal();
    renderFfcMatrixTable();

    const initialLang = (() => {
        try {
            const saved = localStorage.getItem("ffc_language");
            if (saved === "es" || saved === "en") return saved;
        } catch (e) {}
        return "es";
    })();
    setLanguage(initialLang);
})();

// --- Admin Button Click & Permission Access ---
if (headerAdminBtn) {
    headerAdminBtn.addEventListener("click", () => {
        openAdminPanel();
    });
}

if (adminBtn) {
    adminBtn.addEventListener("click", () => {
        openAdminPanel();
    });
}

if (userOpenAdminPanelBtn) {
    userOpenAdminPanelBtn.addEventListener("click", () => {
        closeAllDropdowns();
        openAdminPanel();
    });
}

// Modal Closers & Admin Panel Controls
if (adminPanelClose) adminPanelClose.addEventListener("click", closeAdminPanel);

if (adminLogoutBtn) {
    adminLogoutBtn.addEventListener("click", () => {
        closeAdminPanel();
    });
}

if (adminPanelOverlay) {
    adminPanelOverlay.addEventListener("click", (e) => {
        if (e.target === adminPanelOverlay) closeAdminPanel();
    });
}

// Admin Tabs Navigation
adminTabButtons.forEach(btn => {
    btn.addEventListener("click", () => {
        const targetId = btn.dataset.tab;
        adminTabButtons.forEach(b => b.classList.remove("active"));
        adminTabPanes.forEach(p => p.classList.remove("active"));

        btn.classList.add("active");
        const pane = document.getElementById(targetId);
        if (pane) pane.classList.add("active");

        if (targetId === "tab-verify") {
            if (typeof refreshAdminVerificationData === "function") {
                refreshAdminVerificationData();
            } else if (typeof renderAdminVerifyTab === "function") {
                renderAdminVerifyTab(typeof adminSearchVerifyPilotInput !== "undefined" && adminSearchVerifyPilotInput ? adminSearchVerifyPilotInput.value : "");
            }
        }
        if (targetId === "tab-news") {
            if (typeof renderAdminNewsTab === "function") {
                renderAdminNewsTab();
            }
        }
    });
});

// Save Next Race
if (nextRaceForm) {
    nextRaceForm.addEventListener("submit", async (e) => {
        e.preventDefault();
        const dateTextVal = adminRaceDateText ? adminRaceDateText.value.trim() : "";
        const isTbd = Boolean(adminRaceIsTbd && adminRaceIsTbd.checked) || 
                      (dateTextVal && (dateTextVal.toUpperCase().includes("TBD") || dateTextVal.toUpperCase().includes("TBA") || dateTextVal.toUpperCase().includes("POR DETERMINAR") || dateTextVal.toUpperCase().includes("POR CONFIRMAR"))) ||
                      (!adminRaceDateTime.value && (!adminRaceDateTime.required || (adminRaceIsTbd && adminRaceIsTbd.checked)));

        const updated = {
            round: adminRaceRound ? adminRaceRound.value.trim() : "ROUND 10",
            title: adminRaceTitle ? adminRaceTitle.value.trim() : "NÜRBURGRING GP",
            location: adminRaceLocation ? adminRaceLocation.value.trim() : "NÜRBURGRING · EUROPE",
            dateText: dateTextVal || (isTbd ? "TBD · Por Determinar" : "20 SEP · 16:30 CEST"),
            weatherTemp: adminRaceTemp ? adminRaceTemp.value.trim() : "22°C",
            weatherCondition: adminRaceWeather ? adminRaceWeather.value : "sunny",
            dateTime: isTbd ? "TBD" : (adminRaceDateTime.value || "2026-09-20T16:30"),
            isTbd: isTbd
        };

        try {
            if (raceSaveNotice) {
                raceSaveNotice.textContent = "Guardando en Firestore y actualizando carreras previas...";
                raceSaveNotice.style.color = "var(--gold)";
            }
            await setDoc(doc(db, "configuracion", "proxima_carrera"), updated);
            currentNextRace = updated;
            renderNextRaceOnPage(updated);

            // Automatically complete all preceding races in the season order
            const targetKey = findRaceKeyFromNextRace(updated);
            if (targetKey) {
                await ensurePreviousRacesCompletedForNextRace(targetKey, true);
            }

            if (raceSaveNotice) {
                raceSaveNotice.textContent = "✓ Próxima carrera guardada. Carrera(s) anterior(es) marcada(s) como finalizada(s).";
                raceSaveNotice.style.color = "#3fb950";
                setTimeout(() => { if (raceSaveNotice) raceSaveNotice.textContent = ""; }, 4000);
            }
        } catch (err) {
            console.error("Error saving next race to Firestore:", err);
            if (raceSaveNotice) {
                raceSaveNotice.textContent = "Error al guardar en Firestore: " + err.message;
                raceSaveNotice.style.color = "#f85149";
            }
        }
    });
}

// TBD Controls Handlers
if (adminRaceIsTbd) {
    adminRaceIsTbd.addEventListener("change", (e) => {
        const isChecked = e.target.checked;
        if (adminRaceDateTime) {
            adminRaceDateTime.disabled = isChecked;
            adminRaceDateTime.required = !isChecked;
            if (isChecked) {
                adminRaceDateTime.value = "";
            }
        }
        if (isChecked && adminRaceDateText) {
            if (!adminRaceDateText.value || !adminRaceDateText.value.toUpperCase().includes("TBD")) {
                adminRaceDateText.value = "TBD · Por Determinar";
            }
        } else if (!isChecked && adminRaceDateText && adminRaceDateText.value.toUpperCase().includes("TBD")) {
            adminRaceDateText.value = "20 SEP · 16:30 CEST";
        }
        if (adminRaceDateTimeHint) {
            adminRaceDateTimeHint.textContent = isChecked 
                ? "Fecha por determinar (TBD). El contador en vivo mostrará estado por confirmar."
                : "Ajusta la fecha y hora oficial para que el contador en vivo sincronice automáticamente.";
        }
        updateAdminLivePreview();
    });
}

if (adminSetTbdQuickBtn) {
    adminSetTbdQuickBtn.addEventListener("click", () => {
        if (!adminRaceIsTbd) return;
        adminRaceIsTbd.checked = !adminRaceIsTbd.checked;
        adminRaceIsTbd.dispatchEvent(new Event("change"));
    });
}

if (adminQuickTbdDateTextBtn) {
    adminQuickTbdDateTextBtn.addEventListener("click", () => {
        if (adminRaceDateText) adminRaceDateText.value = "TBD · Por Determinar";
        if (adminRaceIsTbd) {
            adminRaceIsTbd.checked = true;
            adminRaceIsTbd.dispatchEvent(new Event("change"));
        } else {
            updateAdminLivePreview();
        }
    });
}

if (adminQuickTbdResultsDateBtn) {
    adminQuickTbdResultsDateBtn.addEventListener("click", () => {
        if (adminRaceDateInput) adminRaceDateInput.value = "TBD";
    });
}

// Preset Quick Loader
if (adminQuickGpPreset) {
    adminQuickGpPreset.addEventListener("change", (e) => {
        const key = e.target.value;
        if (!key || !OFFICIAL_GP_PRESETS[key]) return;
        const preset = OFFICIAL_GP_PRESETS[key];
        const isPresetTbd = Boolean(preset.dateTime === "TBD" || preset.isTbd || (preset.dateText && (preset.dateText.includes("TBA") || preset.dateText.includes("TBD"))));

        if (adminRaceRound) adminRaceRound.value = preset.round;
        if (adminRaceTitle) adminRaceTitle.value = preset.title;
        if (adminRaceLocation) adminRaceLocation.value = preset.location;
        if (adminRaceDateText) adminRaceDateText.value = preset.dateText;
        if (adminRaceTemp) adminRaceTemp.value = preset.weatherTemp;
        if (adminRaceWeather) adminRaceWeather.value = preset.weatherCondition;

        if (adminRaceIsTbd) {
            adminRaceIsTbd.checked = isPresetTbd;
        }
        if (adminRaceDateTime) {
            adminRaceDateTime.disabled = isPresetTbd;
            adminRaceDateTime.required = !isPresetTbd;
            adminRaceDateTime.value = (!isPresetTbd && preset.dateTime) ? preset.dateTime : "";
        }
        if (adminRaceDateTimeHint) {
            adminRaceDateTimeHint.textContent = isPresetTbd 
                ? "Fecha por determinar (TBD). El contador en vivo mostrará estado por confirmar."
                : "Ajusta la fecha y hora oficial para que el contador en vivo sincronice automáticamente.";
        }

        updateAdminLivePreview();
    });
}

// Live Preview Real-Time Input Synchronization
[adminRaceRound, adminRaceTitle, adminRaceLocation, adminRaceDateText, adminRaceTemp].forEach(inputEl => {
    if (inputEl) {
        inputEl.addEventListener("input", updateAdminLivePreview);
    }
});
if (adminRaceWeather) {
    adminRaceWeather.addEventListener("change", updateAdminLivePreview);
}

// Standings Search Filter
if (adminStandingsSearchInput) {
    adminStandingsSearchInput.addEventListener("input", (e) => {
        const val = e.target.value.toLowerCase().trim();
        if (!adminStandingsTableBody) return;
        const rows = adminStandingsTableBody.querySelectorAll("tr");
        rows.forEach(r => {
            const inputName = r.querySelector(".driver-name-input");
            const teamBadge = r.querySelector(".team-locked-badge");
            const name = inputName ? inputName.value.toLowerCase() : "";
            const team = teamBadge ? teamBadge.textContent.toLowerCase() : "";
            if (!val || name.includes(val) || team.includes(val)) {
                r.style.display = "";
            } else {
                r.style.display = "none";
            }
        });
    });
}

// Drivers Team Filter Listener
if (adminFilterTeamSelect) {
    adminFilterTeamSelect.addEventListener("change", () => {
        renderAdminDriversTab();
    });
}

// Verification Status Filter Listener
if (adminFilterVerifyStatus) {
    adminFilterVerifyStatus.addEventListener("change", () => {
        renderAdminVerifyTab();
    });
}

// Live & Fantasy Quick KPI Listeners
if (adminLiveMode) {
    adminLiveMode.addEventListener("change", () => {
        const isLive = adminLiveMode.checked;
        if (adminQuickLiveStatus) {
            adminQuickLiveStatus.textContent = isLive ? "🔴 EN DIRECTO" : "OFFLINE";
            adminQuickLiveStatus.style.color = isLive ? "#f85149" : "#8c929c";
        }
    });
}

if (adminFantasyLocked) {
    adminFantasyLocked.addEventListener("change", () => {
        const isLocked = adminFantasyLocked.checked;
        if (adminQuickFantasyStatus) {
            adminQuickFantasyStatus.textContent = isLocked ? "🔒 BLOQUEADO" : "⚡ ABIERTO";
            adminQuickFantasyStatus.style.color = isLocked ? "var(--gold-light)" : "#3fb950";
        }
    });
}

// Add Driver in Standings Editor (Team is locked to official roster)
if (adminAddDriverBtn) {
    adminAddDriverBtn.addEventListener("click", () => {
        if (!adminStandingsTableBody) return;
        const count = adminStandingsTableBody.children.length + 1;
        const tr = document.createElement("tr");
        tr.innerHTML = `
            <td style="font-weight: bold; color: var(--gold); text-align: center;">${count}</td>
            <td><input type="text" class="driver-name-input" placeholder="Nombre piloto" required></td>
            <td class="team-locked-cell">
                <span class="team-locked-badge" title="Equipo oficial">—</span>
                <input type="hidden" class="driver-team-input" value="">
            </td>
            <td><input type="number" class="driver-pts-input" value="0" min="0" required></td>
            <td style="text-align: center;"><button type="button" class="admin-remove-btn" title="Eliminar piloto">🗑</button></td>
        `;
        adminStandingsTableBody.prepend(tr);

        const nameInput = tr.querySelector(".driver-name-input");
        const teamBadge = tr.querySelector(".team-locked-badge");
        const teamInput = tr.querySelector(".driver-team-input");

        nameInput.addEventListener("blur", () => {
            const team = getDriverTeam(nameInput.value.trim());
            teamBadge.textContent = team;
            teamBadge.className = `team-locked-badge ${getTeamClass(team)}`;
            teamInput.value = team;
        });

        tr.querySelector(".admin-remove-btn").addEventListener("click", () => tr.remove());
        if (nameInput) nameInput.focus();
    });
}

// Save Standings
if (adminSaveStandingsBtn) {
    adminSaveStandingsBtn.addEventListener("click", async () => {
        if (!adminStandingsTableBody) return;
        const rows = adminStandingsTableBody.querySelectorAll("tr");
        const list = [];

        rows.forEach(row => {
            const nameInput = row.querySelector(".driver-name-input");
            const teamInput = row.querySelector(".driver-team-input");
            const ptsInput = row.querySelector(".driver-pts-input");

            if (nameInput && ptsInput) {
                const name = nameInput.value.trim();
                const officialTeam = getDriverTeam(name) || (teamInput ? teamInput.value.trim() : "") || "Independent";
                const pts = Number(ptsInput.value) || 0;
                const pilotId = row.dataset.pilotId || getPilotDocId(name);
                if (name) {
                    const norm = normalizeDriverKey(name);
                    const existingP = (currentPilotos || []).find(p => (p.id || getPilotDocId(p.driver)) === pilotId || normalizeDriverKey(p.driver) === norm);
                    const verifiedUserInfo = (typeof window !== "undefined" && window.globalVerifiedUsersMap) ? window.globalVerifiedUsersMap.get(norm) : null;
                    const isVer = Boolean((existingP && (existingP.isVerified || existingP.claimedByEmail || existingP.claimedByUid)) || (verifiedUserInfo && verifiedUserInfo.isVerified));

                    const resolvedFlag = (existingP && (existingP.flag || existingP.customFlag)) || getOfficialDriverFlag(name);
                    list.push({
                        ...(existingP || {}),
                        id: pilotId,
                        driver: name,
                        team: officialTeam,
                        flag: resolvedFlag,
                        customFlag: resolvedFlag,
                        pts,
                        isVerified: isVer,
                        claimedByEmail: (existingP && existingP.claimedByEmail) || (verifiedUserInfo ? verifiedUserInfo.email : null),
                        claimedByUid: (existingP && existingP.claimedByUid) || (verifiedUserInfo ? verifiedUserInfo.uid : null),
                        verificationCode: (existingP && existingP.verificationCode) || null
                    });
                }
            }
        });

        // Sort descending by points
        list.sort((a, b) => b.pts - a.pts);

        try {
            if (standingsSaveNotice) {
                standingsSaveNotice.textContent = "Guardando en Firestore...";
                standingsSaveNotice.style.color = "var(--gold)";
            }
            const batch = writeBatch(db);
            list.forEach(p => {
                const docRef = doc(db, "pilotos", p.id || getPilotDocId(p.driver));
                const pPayload = {
                    driver: p.driver,
                    team: p.team,
                    pts: Number(p.pts) || 0,
                    flag: p.flag || p.customFlag || getOfficialDriverFlag(p.driver),
                    customFlag: p.customFlag || p.flag || getOfficialDriverFlag(p.driver)
                };
                if (p.isVerified !== undefined) pPayload.isVerified = p.isVerified;
                if (p.claimedByEmail) pPayload.claimedByEmail = p.claimedByEmail;
                if (p.claimedByUid) pPayload.claimedByUid = p.claimedByUid;
                if (p.verificationCode) pPayload.verificationCode = p.verificationCode;

                batch.set(docRef, pPayload, { merge: true });
            });
            await batch.commit();

            currentPilotos = list;
            renderStandingsOnPage(list);
            renderAdminStandingsEditor(list);
            if (typeof renderAdminVerifyTab === "function") {
                renderAdminVerifyTab(typeof adminSearchVerifyPilotInput !== "undefined" && adminSearchVerifyPilotInput ? adminSearchVerifyPilotInput.value : "");
            }

            if (standingsSaveNotice) {
                standingsSaveNotice.textContent = "✓ Clasificación actualizada en tiempo real en Firestore";
                standingsSaveNotice.style.color = "#3fb950";
                setTimeout(() => { standingsSaveNotice.textContent = ""; }, 3000);
            }
        } catch (err) {
            console.error("Error saving standings to Firestore:", err);
            if (standingsSaveNotice) {
                standingsSaveNotice.textContent = "Error al guardar en Firestore: " + err.message;
                standingsSaveNotice.style.color = "#f85149";
            }
        }
    });
}

// Toggle live mode switch status label
if (adminLiveMode) {
    adminLiveMode.addEventListener("change", () => {
        if (adminSwitchStatusText) {
            const isChecked = adminLiveMode.checked;
            adminSwitchStatusText.textContent = isChecked ? "MODO DIRECTO ACTIVADO" : "MODO DIRECTO DESACTIVADO";
            adminSwitchStatusText.classList.toggle("is-active", isChecked);
        }
    });
}

// Toggle fantasy market lock switch with instant feedback
if (adminFantasyLocked) {
    adminFantasyLocked.addEventListener("change", async () => {
        const isLocked = adminFantasyLocked.checked;
        if (adminFantasyLockStatusText) {
            adminFantasyLockStatusText.textContent = isLocked ? "🔒 MERCADO BLOQUEADO (CARRERA EN CURSO)" : "MERCADO ABIERTO (FICHAJES ACTIVOS)";
            adminFantasyLockStatusText.classList.toggle("is-active", isLocked);
        }
        const current = getSavedSettings();
        const updated = {
            ...current,
            fantasyLocked: isLocked,
            fantasyLockMessage: adminFantasyLockMessage ? adminFantasyLockMessage.value.trim() : (current.fantasyLockMessage || "Mercado de fichajes congelado por Gran Premio en curso.")
        };
        try {
            await setDoc(doc(db, "configuracion", "general"), updated, { merge: true });
            currentSettings = updated;
            renderSettingsOnPage(updated);
            // Sincronizar endpoint de respaldo del servidor
            fetch('/api/fantasy/lock', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ locked: isLocked, message: updated.fantasyLockMessage })
            }).catch(() => {});
        } catch (err) {
            console.error("Error updating fantasy lock in Firestore:", err);
        }
    });
}

// Toggle dynamic price fluctuation switch with instant feedback
if (adminFantasyFluctuation) {
    adminFantasyFluctuation.addEventListener("change", async () => {
        const isFluct = adminFantasyFluctuation.checked;
        if (adminFantasyFluctuationStatusText) {
            adminFantasyFluctuationStatusText.textContent = isFluct ? "FLUCTUACIÓN DINÁMICA ACTIVADA" : "PRECIOS ESTÁTICOS BASE";
            adminFantasyFluctuationStatusText.classList.toggle("is-active", isFluct);
        }
        const current = getSavedSettings();
        const updated = {
            ...current,
            fantasyFluctuationEnabled: isFluct
        };
        try {
            await setDoc(doc(db, "configuracion", "general"), updated, { merge: true });
            currentSettings = updated;
            renderSettingsOnPage(updated);
            fetch('/api/fantasy/lock', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    locked: updated.fantasyLocked,
                    message: updated.fantasyLockMessage,
                    fluctuationEnabled: isFluct,
                    volatilityMultiplier: updated.fantasyVolatilityMultiplier || 1.0
                })
            }).catch(() => {});
        } catch (err) {
            console.error("Error updating fluctuation setting in Firestore:", err);
        }
    });
}

// Change volatility selector
if (adminFantasyVolatility) {
    adminFantasyVolatility.addEventListener("change", async () => {
        const vol = parseFloat(adminFantasyVolatility.value) || 1.0;
        const current = getSavedSettings();
        const updated = {
            ...current,
            fantasyVolatilityMultiplier: vol
        };
        try {
            await setDoc(doc(db, "configuracion", "general"), updated, { merge: true });
            currentSettings = updated;
            renderSettingsOnPage(updated);
            fetch('/api/fantasy/lock', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    locked: updated.fantasyLocked,
                    message: updated.fantasyLockMessage,
                    fluctuationEnabled: updated.fantasyFluctuationEnabled !== false,
                    volatilityMultiplier: vol
                })
            }).catch(() => {});
        } catch (err) {
            console.error("Error updating volatility setting in Firestore:", err);
        }
    });
}

// Recalculate Prices Button
if (adminRecalculatePricesBtn) {
    adminRecalculatePricesBtn.addEventListener("click", () => {
        if (typeof renderAdminMarketSentimentWidget === "function") {
            renderAdminMarketSentimentWidget();
        }
        if (window.isFantasyModuleInitialized && typeof window.renderFantasySlots === "function" && window.ffcFantasyState) {
            window.renderFantasyHUD();
            window.renderFantasySlots();
            if (window.ffcFantasyState.activeSubTab === "market" && typeof window.renderFantasyMarketGrid === "function") {
                window.renderFantasyMarketGrid();
            }
        }
        const originalText = adminRecalculatePricesBtn.textContent;
        adminRecalculatePricesBtn.textContent = "✓ ¡Precios Recalculados!";
        adminRecalculatePricesBtn.style.background = "#238636";
        setTimeout(() => {
            adminRecalculatePricesBtn.textContent = originalText;
            adminRecalculatePricesBtn.style.background = "";
        }, 2200);
    });
}

// Save General Settings
if (generalSettingsForm) {
    generalSettingsForm.addEventListener("submit", async (e) => {
        e.preventDefault();
        const settings = {
            liveMode: adminLiveMode ? adminLiveMode.checked : false,
            twitchChannel: adminTwitchChannel ? adminTwitchChannel.value.trim() : "https://www.twitch.tv/driezzz12",
            liveTitle: adminLiveTitle ? adminLiveTitle.value.trim() : "ESTAMOS EN DIRECTO",
            liveRaceTitle: adminLiveRaceTitle ? adminLiveRaceTitle.value.trim() : "",
            liveSubtitle: adminLiveSubtitle ? adminLiveSubtitle.value.trim() : "Sigue la retransmisión oficial de la carrera en vivo por Twitch.",
            fantasyLocked: adminFantasyLocked ? adminFantasyLocked.checked : false,
            fantasyLockMessage: adminFantasyLockMessage ? adminFantasyLockMessage.value.trim() : "Mercado de fichajes congelado por Gran Premio en curso.",
            fantasyFluctuationEnabled: adminFantasyFluctuation ? adminFantasyFluctuation.checked : true,
            fantasyVolatilityMultiplier: adminFantasyVolatility ? (parseFloat(adminFantasyVolatility.value) || 1.0) : 1.0,
            discordUrl: adminDiscordUrl ? adminDiscordUrl.value.trim() : "",
            xUrl: adminXUrl ? adminXUrl.value.trim() : "",
            instagramUrl: adminInstagramUrl ? adminInstagramUrl.value.trim() : "",
            season: adminStatSeason ? adminStatSeason.value.trim() : "01",
            rounds: adminStatRounds ? adminStatRounds.value.trim() : "15",
            drivers: adminStatDrivers ? adminStatDrivers.value.trim() : "44"
        };

        try {
            if (settingsSaveNotice) {
                settingsSaveNotice.textContent = "Guardando en Firestore...";
                settingsSaveNotice.style.color = "var(--gold)";
            }
            await setDoc(doc(db, "configuracion", "general"), settings, { merge: true });
            currentSettings = settings;
            renderSettingsOnPage(settings);

            // Sincronizar endpoint de respaldo
            fetch('/api/fantasy/lock', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    locked: settings.fantasyLocked,
                    message: settings.fantasyLockMessage,
                    fluctuationEnabled: settings.fantasyFluctuationEnabled,
                    volatilityMultiplier: settings.fantasyVolatilityMultiplier
                })
            }).catch(() => {});

            if (settingsSaveNotice) {
                settingsSaveNotice.textContent = "✓ Ajustes guardados en Firestore";
                settingsSaveNotice.style.color = "#3fb950";
                setTimeout(() => { settingsSaveNotice.textContent = ""; }, 3000);
            }
        } catch (err) {
            console.error("Error saving settings to Firestore:", err);
            if (settingsSaveNotice) {
                settingsSaveNotice.textContent = "Error al guardar en Firestore: " + err.message;
                settingsSaveNotice.style.color = "#f85149";
            }
        }
    });
}

// --- Pilotos & Equipos Tab Events ---
if (adminSaveDriversBtn) {
    adminSaveDriversBtn.addEventListener("click", async () => {
        const rows = adminDriversTableBody ? adminDriversTableBody.querySelectorAll("tr") : [];
        rows.forEach(tr => {
            const teamSel = tr.querySelector(".admin-pilot-team-select");
            const flagSel = tr.querySelector(".admin-pilot-flag-select");
            if (teamSel) {
                const pilotId = teamSel.dataset.pilotId || getPilotDocId(teamSel.dataset.driver);
                const driverName = teamSel.dataset.driver;
                const newTeam = teamSel.value;
                const newFlag = flagSel ? extractFlagFromCountryString(flagSel.value) : "🏁";
                if (pilotId && driverName) {
                    pendingTeamChanges.set(pilotId, { pilotId, driver: driverName, team: newTeam, flag: newFlag });
                }
            }
        });

        if (pendingTeamChanges.size === 0) {
            if (driversSaveNotice) {
                driversSaveNotice.textContent = "No hay cambios de pilotos pendientes.";
                driversSaveNotice.style.color = "var(--gold)";
                setTimeout(() => { driversSaveNotice.textContent = ""; }, 2500);
            }
            return;
        }

        if (driversSaveNotice) {
            driversSaveNotice.textContent = "Actualizando datos de pilotos en Firestore...";
            driversSaveNotice.style.color = "var(--gold)";
        }
        try {
            const batch = writeBatch(db);
            pendingTeamChanges.forEach(({ pilotId, driver, team, flag }) => {
                const updateData = {
                    driver: driver,
                    team: team
                };
                if (flag) {
                    updateData.flag = flag;
                    updateData.customFlag = flag;
                    savePersistentDriverFlag(driver, flag);
                }
                batch.set(doc(db, "pilotos", pilotId), updateData, { merge: true });

                // Also update local currentPilotos if available
                if (typeof currentPilotos !== "undefined" && Array.isArray(currentPilotos)) {
                    const norm = normalizeDriverKey(driver);
                    const match = currentPilotos.find(p => (p.id && p.id === pilotId) || (p.driver && normalizeDriverKey(p.driver) === norm));
                    if (match) {
                        match.team = team;
                        if (flag) {
                            match.flag = flag;
                            match.customFlag = flag;
                        }
                    }
                }
            });
            await batch.commit();
            pendingTeamChanges.clear();

            if (driversSaveNotice) {
                driversSaveNotice.textContent = "✓ Pilotos (equipo y país/bandera) actualizados en Firestore";
                driversSaveNotice.style.color = "#3fb950";
                setTimeout(() => { driversSaveNotice.textContent = ""; }, 3000);
            }

            if (typeof currentPilotos !== "undefined" && typeof renderStandingsOnPage === "function") {
                renderStandingsOnPage(currentPilotos);
            }
            if (typeof renderFfcMatrixTable === "function") {
                renderFfcMatrixTable();
            }
            if (currentOpenModalDriver && typeof openDriverStatsModal === "function") {
                openDriverStatsModal(currentOpenModalDriver);
            }
            renderAdminDriversTab(adminSearchPilotInput ? adminSearchPilotInput.value : "");
        } catch (err) {
            console.error("Error saving driver changes to Firestore:", err);
            if (driversSaveNotice) {
                driversSaveNotice.textContent = "Error al guardar: " + err.message;
                driversSaveNotice.style.color = "#f85149";
            }
        }
    });
}

if (adminNewPilotForm) {
    adminNewPilotForm.addEventListener("submit", async (e) => {
        e.preventDefault();
        const nameInput = document.getElementById("newPilotName");
        const teamSelect = document.getElementById("newPilotTeam");
        const flagSelect = document.getElementById("newPilotFlag");
        const name = nameInput ? nameInput.value.trim() : "";
        const team = teamSelect ? teamSelect.value : "HRT";
        const flag = flagSelect ? extractFlagFromCountryString(flagSelect.value) : "🇪🇸";

        if (!name) return;

        const currentRoster = getOfficialDriverRoster();
        const exists = currentRoster.some(r => r.driver.trim().toLowerCase() === name.toLowerCase());
        if (exists) {
            alert("Este piloto ya se encuentra registrado en el censo oficial.");
            return;
        }

        const pilotId = getPilotDocId(name);
        try {
            if (driversSaveNotice) {
                driversSaveNotice.textContent = `Registrando a ${name} en Firestore...`;
                driversSaveNotice.style.color = "var(--gold)";
            }
            await setDoc(doc(db, "pilotos", pilotId), {
                driver: name,
                team: team,
                flag: flag,
                customFlag: flag,
                pts: 0
            });

            if (nameInput) nameInput.value = "";
            if (driversSaveNotice) {
                driversSaveNotice.textContent = `✓ Piloto ${name} (${flag}) guardado en Firestore en tiempo real`;
                driversSaveNotice.style.color = "#3fb950";
                setTimeout(() => { driversSaveNotice.textContent = ""; }, 3000);
            }
        } catch (err) {
            console.error("Error adding pilot to Firestore:", err);
            if (driversSaveNotice) {
                driversSaveNotice.textContent = "Error al registrar piloto: " + err.message;
                driversSaveNotice.style.color = "#f85149";
            }
        }
    });
}

if (adminSearchPilotInput) {
    adminSearchPilotInput.addEventListener("input", () => {
        renderAdminDriversTab(adminSearchPilotInput.value);
    });
}

// Toggle Standings Rows (Top 10 vs Full) with Smooth Animations
let isCollapsingStandings = false;

if (toggleStandingsBtn) {
    toggleStandingsBtn.addEventListener("click", () => {
        if (isCollapsingStandings) return;

        if (isStandingsExpanded) {
            // Initiate Collapse Animation
            const saved = getSavedStandings();
            const revealedRows = document.querySelectorAll("#driverRowsList .ranking-row, #standingsTableBody tr");
            const extraRows = [];

            revealedRows.forEach((row) => {
                const posEl = row.querySelector(".ranking-row-pos, td:first-child");
                if (posEl) {
                    const posNum = parseInt(posEl.textContent.trim().replace(/\D/g, ""), 10);
                    if (posNum > 12) {
                        extraRows.push(row);
                    }
                }
            });

            if (extraRows.length > 0) {
                isCollapsingStandings = true;
                toggleStandingsBtn.classList.remove("is-expanded");
                toggleStandingsBtn.setAttribute("aria-expanded", "false");
                const label = document.getElementById("standingsToggleLabel");
                const isEn = typeof currentLanguage !== "undefined" && currentLanguage === "en";
                if (label) {
                    label.textContent = isEn
                        ? `VIEW FULL STANDINGS (P13 - P${saved.length})`
                        : `VER CLASIFICACIÓN COMPLETA (P13 - P${saved.length})`;
                }

                // Add collapse animations in reverse order
                const totalExtra = extraRows.length;
                extraRows.forEach((row, idx) => {
                    row.classList.remove("standings-row-revealed");
                    const reverseIdx = totalExtra - 1 - idx;
                    const delay = Math.min(reverseIdx, 20) * 8;
                    row.style.setProperty("--collapse-delay", `${delay}ms`);
                    row.classList.add("standings-row-collapsing");
                });

                const maxAnimationTime = 220 + (Math.min(totalExtra, 20) * 8);

                setTimeout(() => {
                    isStandingsExpanded = false;
                    isCollapsingStandings = false;
                    renderStandingsOnPage(saved);
                }, maxAnimationTime);
                return;
            }

            isStandingsExpanded = false;
            renderStandingsOnPage(saved);
        } else {
            isStandingsExpanded = true;
            const saved = getSavedStandings();
            renderStandingsOnPage(saved);
        }
    });
}

// Race Results Admin Listeners
if (adminSelectRace) {
    adminSelectRace.addEventListener("change", () => {
        populateRaceResultsEditor(adminSelectRace.value);
    });
}

if (adminAddRacePosBtn) {
    adminAddRacePosBtn.addEventListener("click", () => {
        if (!adminRacePositionsBody) return;
        const emptyRow = adminRacePositionsBody.querySelector(".race-pos-empty-row");
        if (emptyRow) emptyRow.remove();
        const count = adminRacePositionsBody.querySelectorAll("tr.race-pos-row").length + 1;
        const driverList = getAllDriverList();

        let driverOptions = `<option value="">-- Seleccionar Piloto --</option>`;
        driverList.forEach(d => {
            driverOptions += `<option value="${escapeHtml(d.driver)}">${escapeHtml(d.driver)}</option>`;
        });

        const tr = document.createElement("tr");
        tr.className = "race-pos-row";
        tr.innerHTML = `
            <td class="pos-cell" style="font-weight: 800; color: var(--gold); text-align: center;">${count}</td>
            <td>
                <select class="race-driver-select" required>
                    ${driverOptions}
                </select>
            </td>
            <td>
                <div class="race-team-lock-box">
                    <span class="team-locked-badge">—</span>
                    <input type="hidden" class="race-team-val" value="">
                </div>
            </td>
            <td>
                <select class="race-status-select">
                    <option value="FINISHED" selected>FINISHED</option>
                    <option value="DNF">DNF</option>
                    <option value="DNS">DNS</option>
                    <option value="DSQ">DSQ</option>
                </select>
            </td>
            <td class="race-pos-pts-cell" style="text-align: center;">
                ${getF1PointsBadgeHtml(count, "FINISHED")}
            </td>
            <td style="text-align: center;">
                <button type="button" class="admin-remove-btn race-pos-remove-btn" title="Eliminar posición">🗑</button>
            </td>
        `;

        const driverSelect = tr.querySelector(".race-driver-select");
        const teamBadge = tr.querySelector(".team-locked-badge");
        const teamVal = tr.querySelector(".race-team-val");
        const statusSelect = tr.querySelector(".race-status-select");
        const ptsCell = tr.querySelector(".race-pos-pts-cell");

        driverSelect.addEventListener("change", () => {
            const val = driverSelect.value;
            const officialTeam = getDriverTeam(val);
            if (teamBadge && teamVal) {
                teamBadge.textContent = officialTeam;
                teamBadge.className = `team-locked-badge ${getTeamClass(officialTeam)}`;
                teamVal.value = officialTeam;
            }
        });

        statusSelect.addEventListener("change", () => {
            const currentPos = parseInt(tr.querySelector(".pos-cell").textContent, 10) || count;
            if (ptsCell) {
                ptsCell.innerHTML = getF1PointsBadgeHtml(currentPos, statusSelect.value);
            }
        });

        tr.querySelector(".race-pos-remove-btn").addEventListener("click", () => {
            tr.remove();
            reindexRacePositions();
        });

        adminRacePositionsBody.appendChild(tr);
    });
}

if (adminLoadDefaultPosBtn) {
    adminLoadDefaultPosBtn.addEventListener("click", () => {
        renderRacePositionsTable(getDefaultTop10Positions());
    });
}

// --- Dynamic Standings & Points Calculation Engine ---
function calculateAllStandingsFromRaces(racesMap = raceResults, baseDriverList = []) {
    const driversMap = new Map();
    const finishesMap = new Map();

    // 1. Seed drivers from official roster and existing list
    const allKnown = getAllDriverList();
    allKnown.forEach(d => {
        if (!d.driver) return;
        const k = normalizeDriverKey(d.driver);
        if (!driversMap.has(k)) {
            const initialFlag = d.flag || d.customFlag || getOfficialDriverFlag(d.driver);
            driversMap.set(k, {
                id: getPilotDocId(d.driver),
                driver: d.driver,
                team: getDriverTeam(d.driver) || d.team || "Independent",
                pts: 0,
                flag: initialFlag,
                customFlag: initialFlag
            });
            finishesMap.set(k, {});
        }
    });

    // 2. Merge existing driver metadata (isVerified, claimedByEmail, verificationCode, card customizations)
    const sourcesToPreserve = [
        ...(Array.isArray(currentPilotos) ? currentPilotos : []),
        ...(Array.isArray(baseDriverList) ? baseDriverList : [])
    ];
    sourcesToPreserve.forEach(d => {
        if (!d || !d.driver) return;
        const k = normalizeDriverKey(d.driver);
        const resolvedFlag = d.flag || d.customFlag || getOfficialDriverFlag(d.driver);
        if (!driversMap.has(k)) {
            driversMap.set(k, {
                id: d.id || getPilotDocId(d.driver),
                driver: d.driver,
                team: getDriverTeam(d.driver) || d.team || "Independent",
                pts: 0,
                flag: resolvedFlag,
                customFlag: resolvedFlag
            });
            finishesMap.set(k, {});
        }
        const entry = driversMap.get(k);
        if (d.id) entry.id = d.id;
        if (d.isVerified !== undefined) entry.isVerified = Boolean(d.isVerified);
        if (d.claimedByEmail) entry.claimedByEmail = d.claimedByEmail;
        if (d.claimedByUid) entry.claimedByUid = d.claimedByUid;
        if (d.verificationCode) entry.verificationCode = d.verificationCode;
        if (d.avatarUrl) entry.avatarUrl = d.avatarUrl;
        if (d.cardColor) entry.cardColor = d.cardColor;
        entry.flag = resolvedFlag;
        entry.customFlag = resolvedFlag;
        if (d.bio) entry.bio = d.bio;
        if (d.socialTwitch) entry.socialTwitch = d.socialTwitch;
        if (d.socialYoutube) entry.socialYoutube = d.socialYoutube;
        if (d.socialTwitter) entry.socialTwitter = d.socialTwitter;
        if (d.socialDiscord) entry.socialDiscord = d.socialDiscord;
    });

    // Cross-reference with global verified users map
    if (typeof window !== "undefined" && window.globalVerifiedUsersMap && window.globalVerifiedUsersMap.size > 0) {
        window.globalVerifiedUsersMap.forEach((uInfo, k) => {
            if (driversMap.has(k)) {
                const entry = driversMap.get(k);
                entry.isVerified = true;
                if (uInfo.email && !entry.claimedByEmail) entry.claimedByEmail = uInfo.email;
                if (uInfo.uid && !entry.claimedByUid) entry.claimedByUid = uInfo.uid;
            }
        });
    }

    // 3. Iterate through all completed races and calculate official points
    Object.values(racesMap).forEach(race => {
        if (!race || !Array.isArray(race.drivers) || race.drivers.length === 0) return;
        const isCompleted = race.status === "COMPLETED" || (race.winner && race.winner !== "TBA");
        if (!isCompleted) return;

        // Position points: 1º: 25, 2º: 18, 3º: 15, 4º: 12, 5º: 10, 6º: 8, 7º: 6, 8º: 4, 9º: 2, 10º: 1
        race.drivers.forEach((d, idx) => {
            if (!d || !d.driver) return;
            const k = normalizeDriverKey(d.driver);
            if (!driversMap.has(k)) {
                driversMap.set(k, {
                    id: getPilotDocId(d.driver),
                    driver: d.driver,
                    team: getDriverTeam(d.driver) || d.team || "Independent",
                    pts: 0
                });
                finishesMap.set(k, {});
            }

            const pos = Number(d.pos) || (idx + 1);
            if (d.status !== "DSQ") {
                const f = finishesMap.get(k) || {};
                f[pos] = (f[pos] || 0) + 1;
                finishesMap.set(k, f);

                if (pos >= 1 && pos <= 10) {
                    const pts = F1_POINTS_MAP[pos] || 0;
                    driversMap.get(k).pts += pts;
                }
            }
        });

        // Fastest Lap (Vuelta Rápida): +1 PT
        if (race.fastest && race.fastest !== "TBA") {
            const rawName = race.fastest.split("·")[0].trim();
            if (rawName) {
                const k = normalizeDriverKey(rawName);
                if (driversMap.has(k)) {
                    driversMap.get(k).pts += F1_FASTEST_LAP_PTS;
                }
            }
        }
    });

    // 4. Sort drivers: points descending, then tiebreakers (most 1st places, 2nd places...), then alphabetically
    const list = Array.from(driversMap.values());
    list.sort((a, b) => {
        const ptsA = Number(a.pts) || 0;
        const ptsB = Number(b.pts) || 0;
        if (ptsB !== ptsA) return ptsB - ptsA;

        const kA = normalizeDriverKey(a.driver);
        const kB = normalizeDriverKey(b.driver);
        const fA = finishesMap.get(kA) || {};
        const fB = finishesMap.get(kB) || {};
        for (let p = 1; p <= 15; p++) {
            const cA = fA[p] || 0;
            const cB = fB[p] || 0;
            if (cB !== cA) return cB - cA;
        }

        return a.driver.localeCompare(b.driver, undefined, { sensitivity: "base" });
    });

    return list.map((d, idx) => ({ ...d, pos: idx + 1 }));
}

async function recalculateAndSyncStandings(racesMap = raceResults) {
    const baseList = (currentPilotos && currentPilotos.length > 0) ? currentPilotos : defaultStandings;
    const newStandings = calculateAllStandingsFromRaces(racesMap, baseList);

    try {
        const batch = writeBatch(db);
        newStandings.forEach(p => {
            const docRef = doc(db, "pilotos", p.id || getPilotDocId(p.driver));
            const pPayload = {
                driver: p.driver,
                team: p.team || getDriverTeam(p.driver) || "Independent",
                pts: Number(p.pts) || 0,
                flag: p.flag || p.customFlag || getOfficialDriverFlag(p.driver),
                customFlag: p.customFlag || p.flag || getOfficialDriverFlag(p.driver)
            };
            if (p.isVerified !== undefined) pPayload.isVerified = p.isVerified;
            if (p.claimedByEmail) pPayload.claimedByEmail = p.claimedByEmail;
            if (p.claimedByUid) pPayload.claimedByUid = p.claimedByUid;
            if (p.verificationCode) pPayload.verificationCode = p.verificationCode;

            batch.set(docRef, pPayload, { merge: true });
        });
        await batch.commit();
    } catch (err) {
        console.error("Error batch saving recalculated standings to Firestore:", err);
    }

    currentPilotos = newStandings;
    renderStandingsOnPage(currentPilotos);

    if (typeof updateStandingsToggleUI === "function") {
        updateStandingsToggleUI(currentPilotos.length);
    }

    if (adminStandingsTableBody) {
        renderAdminStandingsEditor(currentPilotos);
    }
    if (adminDriversTableBody) {
        renderAdminDriversTab(adminSearchPilotInput ? adminSearchPilotInput.value : "");
    }
    if (typeof renderAdminVerifyTab === "function") {
        renderAdminVerifyTab(typeof adminSearchVerifyPilotInput !== "undefined" && adminSearchVerifyPilotInput ? adminSearchVerifyPilotInput.value : "");
    }

    // Refresh fantasy prices and leaderboard immediately
    updateFantasyWithNewStandings();

    return newStandings;
}

if (raceResultsForm) {
    raceResultsForm.addEventListener("submit", async (e) => {
        e.preventDefault();
        const raceKey = adminSelectRace ? adminSelectRace.value : "";
        if (!raceKey) return;

        const fastestDriver = adminFastestDriver ? adminFastestDriver.value : "";
        const fastestTime = adminFastestTime ? adminFastestTime.value.trim() : "";
        if (!fastestDriver || !fastestTime) {
            if (raceResultsSaveNotice) {
                raceResultsSaveNotice.textContent = "⚠️ Debes seleccionar un piloto y especificar el tiempo de la Vuelta Rápida.";
                raceResultsSaveNotice.style.color = "#f85149";
            }
            return;
        }

        const poleDriver = adminPoleDriver ? adminPoleDriver.value : "";
        const poleTime = adminPoleTime ? adminPoleTime.value.trim() : "";
        const driverDay = adminDriverDay ? adminDriverDay.value : "";
        const raceDate = adminRaceDateInput ? adminRaceDateInput.value.trim() : "";
        const replayUrl = adminRaceReplayUrl ? adminRaceReplayUrl.value.trim() : "";

        const positionRows = adminRacePositionsBody ? adminRacePositionsBody.querySelectorAll("tr") : [];
        const drivers = [];
        let winnerDriver = "";

        positionRows.forEach((row, idx) => {
            const driverSelect = row.querySelector(".race-driver-select");
            const teamVal = row.querySelector(".race-team-val");
            const statusSelect = row.querySelector(".race-status-select");

            const driverName = driverSelect ? driverSelect.value.trim() : "";
            const teamName = teamVal ? teamVal.value.trim() : getDriverTeam(driverName);
            const statusName = statusSelect ? statusSelect.value.trim() : "FINISHED";

            if (driverName) {
                if (idx === 0) winnerDriver = driverName;
                drivers.push({
                    pos: idx + 1,
                    driver: driverName,
                    team: teamName || getDriverTeam(driverName),
                    status: statusName
                });
            }
        });

        if (drivers.length === 0) {
            if (raceResultsSaveNotice) {
                raceResultsSaveNotice.textContent = "⚠️ Añade al menos un piloto en el orden de llegada.";
                raceResultsSaveNotice.style.color = "#f85149";
            }
            return;
        }

        const meta = seasonRacesMeta[raceKey] || {
            round: "ROUND",
            title: raceKey.toUpperCase(),
            location: raceKey.toUpperCase(),
            date: raceDate || "TBA"
        };

        const chosenStatus = adminRaceStatusSelect ? adminRaceStatusSelect.value : "COMPLETED";

        const updatedRace = {
            round: meta.round,
            title: meta.title,
            location: meta.location,
            date: raceDate || meta.date,
            status: chosenStatus,
            winner: winnerDriver || drivers[0].driver,
            pole: poleDriver && poleTime ? `${poleDriver} · ${poleTime}` : (poleDriver || "TBA"),
            fastest: `${fastestDriver} · ${fastestTime}`,
            driverDay: driverDay || winnerDriver || drivers[0].driver,
            replayUrl: replayUrl,
            drivers: drivers
        };

        try {
            if (raceResultsSaveNotice) {
                raceResultsSaveNotice.textContent = "Guardando resultados, actualizando calendario y recalculando clasificación...";
                raceResultsSaveNotice.style.color = "var(--gold)";
            }
            await setDoc(doc(db, "carreras", raceKey), updatedRace);

            raceResults[raceKey] = updatedRace;

            // If marked as UPCOMING / PRÓXIMA, automatically ensure all previous races are marked as COMPLETED
            if (chosenStatus === "UPCOMING") {
                await ensurePreviousRacesCompletedForNextRace(raceKey, true);
            } else {
                // Automatically synchronize calendar progression & update hero countdown
                await syncCalendarAndNextRace(true);
                // Automatically recalculate points & standings for drivers and teams
                await recalculateAndSyncStandings(raceResults);
            }

            populateRaceResultsEditor(raceKey);

            if (raceResultsSaveNotice) {
                const prevIndex = SEASON_RACE_ORDER.indexOf(raceKey) - 1;
                const prevTitle = prevIndex >= 0 ? (seasonRacesMeta[SEASON_RACE_ORDER[prevIndex]]?.title || SEASON_RACE_ORDER[prevIndex].toUpperCase()) : null;
                raceResultsSaveNotice.textContent = chosenStatus === "UPCOMING" && prevTitle
                    ? `✓ ${meta.title} guardada como PRÓXIMA. Carrera anterior (${prevTitle}) marcada como FINALIZADA.`
                    : `✓ Resultados de ${meta.title} guardados. Calendario y próxima carrera actualizados.`;
                raceResultsSaveNotice.style.color = "#3fb950";
                setTimeout(() => { if (raceResultsSaveNotice) raceResultsSaveNotice.textContent = ""; }, 4000);
            }
        } catch (err) {
            console.error("Error saving race to Firestore:", err);
            if (raceResultsSaveNotice) {
                raceResultsSaveNotice.textContent = "Error al guardar en Firestore: " + err.message;
                raceResultsSaveNotice.style.color = "#f85149";
            }
        }
    });
}

// Admin Set As Next Race Button ("Fijar como Próxima")
if (adminSetAsNextRaceBtn) {
    adminSetAsNextRaceBtn.addEventListener("click", async (e) => {
        e.preventDefault();
        e.stopPropagation();

        const raceKey = (adminSelectRace && adminSelectRace.value) ? adminSelectRace.value : "australia";
        if (!raceKey) return;

        const meta = seasonRacesMeta[raceKey] || {
            round: "ROUND",
            title: raceKey.toUpperCase(),
            location: raceKey.toUpperCase(),
            date: "TBA"
        };

        if (raceResultsSaveNotice) {
            raceResultsSaveNotice.textContent = `Fijando ${meta.title} como próxima carrera y marcando anteriores como finalizadas...`;
            raceResultsSaveNotice.style.color = "var(--gold)";
        }

        try {
            await ensurePreviousRacesCompletedForNextRace(raceKey, true);
            populateRaceResultsEditor(raceKey);
            if (typeof populateAdminForms === "function") {
                populateAdminForms();
            }

            const prevIndex = SEASON_RACE_ORDER.indexOf(raceKey) - 1;
            const prevTitle = prevIndex >= 0 ? (seasonRacesMeta[SEASON_RACE_ORDER[prevIndex]]?.title || SEASON_RACE_ORDER[prevIndex].toUpperCase()) : null;

            if (raceResultsSaveNotice) {
                raceResultsSaveNotice.textContent = prevTitle
                    ? `✓ ${meta.title} fijada como PRÓXIMA carrera. Carrera anterior (${prevTitle}) marcada como FINALIZADA.`
                    : `✓ ${meta.title} fijada como PRÓXIMA carrera del calendario.`;
                raceResultsSaveNotice.style.color = "#3fb950";
                setTimeout(() => { if (raceResultsSaveNotice) raceResultsSaveNotice.textContent = ""; }, 4500);
            }
        } catch (err) {
            console.error("Error setting race as next:", err);
            if (raceResultsSaveNotice) {
                raceResultsSaveNotice.textContent = "Error al fijar como próxima: " + err.message;
                raceResultsSaveNotice.style.color = "#f85149";
            }
        }
    });
}

// Admin Toggle Race Status Button (Marcar como Acabada / Marcar como Pendiente)
if (adminToggleRaceStatusBtn) {
    adminToggleRaceStatusBtn.addEventListener("click", async (e) => {
        e.preventDefault();
        e.stopPropagation();

        const raceKey = (adminSelectRace && adminSelectRace.value) ? adminSelectRace.value : "australia";
        if (!raceKey) return;

        const currentData = raceResults[raceKey] || seasonRacesMeta[raceKey] || {};
        const isCurrentlyCompleted = isRaceFinished(currentData);
        const newStatus = isCurrentlyCompleted ? "UPCOMING" : "COMPLETED";

        const meta = seasonRacesMeta[raceKey] || {
            round: "ROUND",
            title: raceKey.toUpperCase(),
            location: raceKey.toUpperCase(),
            date: "TBA"
        };

        if (raceResultsSaveNotice) {
            raceResultsSaveNotice.textContent = isCurrentlyCompleted 
                ? `Marcando ${meta.title} como próxima y completando las anteriores...` 
                : `Marcando ${meta.title} como finalizada y avanzando calendario...`;
            raceResultsSaveNotice.style.color = "var(--gold)";
        }

        let updatedRace = { ...currentData };
        updatedRace.status = newStatus;
        updatedRace.round = updatedRace.round || meta.round;
        updatedRace.title = updatedRace.title || meta.title;
        updatedRace.location = updatedRace.location || meta.location;
        updatedRace.date = (adminRaceDateInput && adminRaceDateInput.value.trim()) || updatedRace.date || meta.date || "TBA";

        // If newly marked as completed and has no drivers, fill with currently present rows or fallback
        if (newStatus === "COMPLETED") {
            if (!Array.isArray(updatedRace.drivers) || updatedRace.drivers.length === 0) {
                const positionRows = adminRacePositionsBody ? adminRacePositionsBody.querySelectorAll("tr") : [];
                const tempDrivers = [];
                positionRows.forEach((row, idx) => {
                    const driverSelect = row.querySelector(".race-driver-select");
                    const teamVal = row.querySelector(".race-team-val");
                    const statusSelect = row.querySelector(".race-status-select");
                    const dName = driverSelect ? driverSelect.value.trim() : "";
                    if (dName) {
                        tempDrivers.push({
                            pos: idx + 1,
                            driver: dName,
                            team: teamVal ? teamVal.value.trim() : getDriverTeam(dName),
                            status: statusSelect ? statusSelect.value.trim() : "FINISHED"
                        });
                    }
                });

                if (tempDrivers.length > 0) {
                    updatedRace.drivers = tempDrivers;
                    updatedRace.winner = tempDrivers[0].driver;
                } else if (currentStandings && currentStandings.length > 0) {
                    // Pre-fill with top standings drivers if empty
                    updatedRace.drivers = currentStandings.slice(0, 10).map((d, i) => ({
                        pos: i + 1,
                        driver: d.driver,
                        team: d.team || getDriverTeam(d.driver),
                        status: "FINISHED"
                    }));
                    updatedRace.winner = updatedRace.drivers[0].driver;
                }
            }
            if (!updatedRace.winner || updatedRace.winner === "TBA") {
                if (updatedRace.drivers && updatedRace.drivers[0]) {
                    updatedRace.winner = updatedRace.drivers[0].driver;
                }
            }
        }

        // Instant local update
        raceResults[raceKey] = updatedRace;

        try {
            await setDoc(doc(db, "carreras", raceKey), updatedRace);

            if (newStatus === "UPCOMING") {
                // When marking this race as UPCOMING/PRÓXIMA, also ensure previous races are completed
                await ensurePreviousRacesCompletedForNextRace(raceKey, true);
            } else {
                // Automatically advance calendar progression and recalculate countdown
                await syncCalendarAndNextRace(true);
                // Recalculate standings
                await recalculateAndSyncStandings(raceResults);
            }

            populateRaceResultsEditor(raceKey);

            if (raceResultsSaveNotice) {
                const prevIndex = SEASON_RACE_ORDER.indexOf(raceKey) - 1;
                const prevTitle = prevIndex >= 0 ? (seasonRacesMeta[SEASON_RACE_ORDER[prevIndex]]?.title || SEASON_RACE_ORDER[prevIndex].toUpperCase()) : null;

                raceResultsSaveNotice.textContent = newStatus === "COMPLETED"
                    ? `✓ ${meta.title} marcada como ACABADA. Próxima carrera actualizada en el calendario y hero con countdown.`
                    : (prevTitle 
                        ? `✓ ${meta.title} marcada como PRÓXIMA. Carrera anterior (${prevTitle}) marcada como FINALIZADA.`
                        : `✓ ${meta.title} marcada como PRÓXIMA / PENDIENTE.`);
                raceResultsSaveNotice.style.color = "#3fb950";
                setTimeout(() => { if (raceResultsSaveNotice) raceResultsSaveNotice.textContent = ""; }, 4500);
            }
        } catch (err) {
            console.error("Error updating race status in Firestore:", err);
            if (raceResultsSaveNotice) {
                raceResultsSaveNotice.textContent = "Error al actualizar estado: " + err.message;
                raceResultsSaveNotice.style.color = "#f85149";
            }
        }
    });
}

// Direct Race Status Select Change Listener
if (adminRaceStatusSelect) {
    adminRaceStatusSelect.addEventListener("change", async () => {
        const val = adminRaceStatusSelect.value;
        const isComp = val === "COMPLETED";
        if (adminRaceStatusBadge) {
            adminRaceStatusBadge.className = `admin-status-pill ${isComp ? "status-completed" : "status-upcoming"}`;
            adminRaceStatusBadge.textContent = isComp ? "🏁 FINALIZADA / ACABADA" : "⏳ PRÓXIMA / PENDIENTE";
        }
        if (adminToggleRaceStatusBtnLabel) {
            adminToggleRaceStatusBtnLabel.textContent = isComp ? "Marcar como Pendiente" : "Marcar como Acabada";
        }
        if (adminToggleRaceStatusBtn) {
            adminToggleRaceStatusBtn.className = isComp ? "btn btn-secondary btn-sm" : "btn btn-primary btn-sm";
        }
        if (!isComp) {
            const raceKey = (adminSelectRace && adminSelectRace.value) ? adminSelectRace.value : "australia";
            if (raceKey) {
                await ensurePreviousRacesCompletedForNextRace(raceKey, true);
                populateRaceResultsEditor(raceKey);
            }
        }
    });
}

// Reset Race Results Logic
async function resetCurrentRace() {
    const raceKey = (adminSelectRace && adminSelectRace.value) ? adminSelectRace.value : "australia";
    if (!raceKey) return;

    const meta = seasonRacesMeta[raceKey] || {
        round: "ROUND",
        title: raceKey.toUpperCase(),
        location: raceKey.toUpperCase(),
        date: "TBA"
    };

    const confirmMsg = `¿Deseas restablecer los resultados oficiales de ${meta.title}?\n\n• Se borrarán los tiempos de vuelta rápida y pole position.\n• Se vaciará el orden de llegada de los pilotos.\n• La carrera pasará a estado PRÓXIMA / UPCOMING en el calendario.\n• Los puntos y clasificaciones (pilotos y escuderías) se recalcularán automáticamente en tiempo real sin esta carrera.`;

    const confirmed = await showAppConfirm(`Restablecer ${meta.title}`, confirmMsg, "Sí, Restablecer Carrera", "Cancelar");
    if (!confirmed) return;

    const resetRaceData = {
        round: meta.round,
        title: meta.title,
        location: meta.location,
        date: (adminRaceDateInput && adminRaceDateInput.value.trim()) || meta.date || "TBA",
        status: "UPCOMING",
        winner: "TBA",
        pole: "TBA",
        fastest: "TBA",
        driverDay: "TBA",
        p2: "TBA",
        p3: "TBA",
        weather: "",
        drivers: []
    };

    // 1. Instant local update (no lag in UI)
    raceResults[raceKey] = resetRaceData;
    populateRaceResultsEditor(raceKey);

    if (raceResultsSaveNotice) {
        raceResultsSaveNotice.textContent = `Restableciendo resultados de ${meta.title}, actualizando calendario y clasificación...`;
        raceResultsSaveNotice.style.color = "var(--gold)";
    }

    try {
        // 2. Persist reset race in Firestore
        await setDoc(doc(db, "carreras", raceKey), resetRaceData);

        // 3. Automatically advance calendar progression & update hero countdown
        await syncCalendarAndNextRace(true);

        // 4. Recalculate standings and sync to Firestore
        await recalculateAndSyncStandings(raceResults);

        if (raceResultsSaveNotice) {
            raceResultsSaveNotice.textContent = `✓ Resultados de ${meta.title} restablecidos con éxito. Calendario y standings actualizados.`;
            raceResultsSaveNotice.style.color = "#3fb950";
            setTimeout(() => { if (raceResultsSaveNotice) raceResultsSaveNotice.textContent = ""; }, 4000);
        }
    } catch (err) {
        console.error("Error resetting race:", err);
        if (raceResultsSaveNotice) {
            raceResultsSaveNotice.textContent = "Error al restablecer carrera: " + err.message;
            raceResultsSaveNotice.style.color = "#f85149";
        }
    }
}

if (adminResetRaceBtn) {
    adminResetRaceBtn.addEventListener("click", (e) => {
        e.preventDefault();
        e.stopPropagation();
        resetCurrentRace();
    });
}
if (adminResetRaceBtnBottom) {
    adminResetRaceBtnBottom.addEventListener("click", (e) => {
        e.preventDefault();
        e.stopPropagation();
        resetCurrentRace();
    });
}

// Manual Standings Recalculation Button
if (adminRecalcStandingsBtn) {
    adminRecalcStandingsBtn.addEventListener("click", async () => {
        try {
            if (standingsSaveNotice) {
                standingsSaveNotice.textContent = "Recalculando puntos desde todas las carreras...";
                standingsSaveNotice.style.color = "var(--gold)";
            }
            await recalculateAndSyncStandings(raceResults);
            if (standingsSaveNotice) {
                standingsSaveNotice.textContent = "✓ Puntos y clasificaciones recalculados exitosamente";
                standingsSaveNotice.style.color = "#3fb950";
                setTimeout(() => { standingsSaveNotice.textContent = ""; }, 3500);
            }
        } catch (err) {
            console.error("Error recalculating standings:", err);
            if (standingsSaveNotice) {
                standingsSaveNotice.textContent = "Error al recalcular: " + err.message;
                standingsSaveNotice.style.color = "#f85149";
            }
        }
    });
}

// Reset to Defaults
if (adminResetDefaultBtn) {
    adminResetDefaultBtn.addEventListener("click", async () => {
        const confirmed = await showAppConfirm("Restablecer Todo", "¿Seguro que deseas restablecer todos los datos de fábrica en la base de datos Firestore?\n\nEsta acción reiniciará los pilotos, carreras y configuración a sus valores iniciales.", "Sí, Restablecer Todo", "Cancelar");
        if (!confirmed) return;

        try {
            if (settingsSaveNotice) {
                settingsSaveNotice.textContent = "Restableciendo datos en Firestore...";
                settingsSaveNotice.style.color = "var(--gold)";
            }

            // Reset next race
            await setDoc(doc(db, "configuracion", "proxima_carrera"), defaultNextRace);
            // Reset settings
            await setDoc(doc(db, "configuracion", "general"), defaultSettings);

            // Reset drivers
            const batch = writeBatch(db);
            const defaultDriverIds = new Set(defaultStandings.map(d => getPilotDocId(d.driver)));

            // Delete any drivers not in default roster
            if (currentPilotos && currentPilotos.length > 0) {
                currentPilotos.forEach(cp => {
                    if (!defaultDriverIds.has(cp.id)) {
                        batch.delete(doc(db, "pilotos", cp.id));
                    }
                });
            }

            defaultStandings.forEach(d => {
                const docRef = doc(db, "pilotos", getPilotDocId(d.driver));
                batch.set(docRef, {
                    driver: d.driver,
                    team: d.team,
                    pts: Number(d.pts) || 0
                });
            });

            // Reset carreras collection in Firestore
            Object.keys(defaultRaceResults).forEach(raceKey => {
                const docRef = doc(db, "carreras", raceKey);
                batch.set(docRef, defaultRaceResults[raceKey]);
            });

            await batch.commit();

            raceResults = { ...defaultRaceResults };
            renderNextRaceOnPage(defaultNextRace);
            renderStandingsOnPage(defaultStandings);
            renderSettingsOnPage(defaultSettings);
            initRaceResults();
            renderFfcMatrixTable();
            populateAdminForms();

            if (settingsSaveNotice) {
                settingsSaveNotice.textContent = "✓ Datos restablecidos en Firestore con éxito";
                settingsSaveNotice.style.color = "#3fb950";
                setTimeout(() => { settingsSaveNotice.textContent = ""; }, 3000);
            }
        } catch (err) {
            console.error("Error resetting defaults in Firestore:", err);
            if (settingsSaveNotice) {
                settingsSaveNotice.textContent = "Error al restablecer en Firestore: " + err.message;
                settingsSaveNotice.style.color = "#f85149";
            }
        }
    });
}

/* =========================================================
   USER AUTHENTICATION (EMAIL & PASSWORD) — FORMULA FACTOR
========================================================= */

// Helper: Standardized document ID for user emails in Firestore
function getUserDocId(email) {
    if (!email) return "";
    return email.trim().toLowerCase().replace(/[^a-z0-9_.-]/g, '_');
}

// Helper: Secure password hashing for multi-device cloud storage
async function hashUserPassword(password) {
    if (!password) return "";
    try {
        const encoder = new TextEncoder();
        const data = encoder.encode(password + "_formula_factor_auth_salt_2026");
        const hashBuffer = await crypto.subtle.digest('SHA-256', data);
        const hashArray = Array.from(new Uint8Array(hashBuffer));
        return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
    } catch (e) {
        let hash = 0;
        for (let i = 0; i < password.length; i++) {
            hash = ((hash << 5) - hash) + password.charCodeAt(i);
            hash |= 0;
        }
        return "fallback_hash_" + hash;
    }
}

// Local fallback authentication store (enables offline capability & local cache)
const LocalAuthStore = {
    getUsers() {
        try {
            const raw = localStorage.getItem("ffc_registered_users");
            return raw ? JSON.parse(raw) : [];
        } catch (e) {
            return [];
        }
    },
    saveUsers(users) {
        try {
            localStorage.setItem("ffc_registered_users", JSON.stringify(users));
        } catch (e) {}
    },
    saveCloudUserLocal(user, plainPassword = "") {
        try {
            const users = this.getUsers();
            const normalizedEmail = (user.email || "").toLowerCase().trim();
            const idx = users.findIndex(u => (u.email || "").toLowerCase().trim() === normalizedEmail);
            const entry = {
                uid: user.uid,
                displayName: user.displayName,
                email: normalizedEmail,
                password: plainPassword || (idx >= 0 ? users[idx].password : ""),
                passwordHash: user.passwordHash || (idx >= 0 ? users[idx].passwordHash : ""),
                createdAt: user.createdAt || new Date().toISOString()
            };
            if (idx >= 0) {
                users[idx] = entry;
            } else {
                users.push(entry);
            }
            this.saveUsers(users);
        } catch (e) {}
    },
    getCurrentUser() {
        try {
            const raw = localStorage.getItem("ffc_current_user");
            return raw ? JSON.parse(raw) : null;
        } catch (e) {
            return null;
        }
    },
    setCurrentUser(user) {
        try {
            if (user) {
                localStorage.setItem("ffc_current_user", JSON.stringify(user));
            } else {
                localStorage.removeItem("ffc_current_user");
            }
        } catch (e) {}
    },
    register(displayName, email, password) {
        const users = this.getUsers();
        const normalizedEmail = email.toLowerCase().trim();
        const existing = users.find(u => (u.email || "").toLowerCase().trim() === normalizedEmail);
        if (existing) {
            throw { code: "auth/email-already-in-use", message: "Email already in use" };
        }
        const newUser = {
            uid: "user_" + Date.now() + "_" + Math.random().toString(36).substring(2, 7),
            displayName: displayName.trim() || email.split("@")[0],
            email: normalizedEmail,
            password: password,
            createdAt: new Date().toISOString()
        };
        users.push(newUser);
        this.saveUsers(users);
        this.setCurrentUser(newUser);
        return newUser;
    },
    login(email, password) {
        const users = this.getUsers();
        const normalizedEmail = email.toLowerCase().trim();
        const found = users.find(u => (u.email || "").toLowerCase().trim() === normalizedEmail);
        if (!found) {
            throw { code: "auth/user-not-found", message: "User not found" };
        }
        if (found.password && found.password !== password) {
            throw { code: "auth/wrong-password", message: "Wrong password" };
        }
        this.setCurrentUser(found);
        return found;
    },
    logout() {
        this.setCurrentUser(null);
    }
};

// Cloud Authentication Service with direct Firebase Firestore & backend synchronization
const CloudAuthService = {
    async registerUser(displayName, email, password) {
        const cleanEmail = email.trim().toLowerCase();
        const cleanName = displayName.trim() || cleanEmail.split("@")[0];
        const docId = getUserDocId(cleanEmail);
        const pHash = await hashUserPassword(password);
        let cloudUser = null;

        // 1. Try Firebase Auth first
        try {
            const userCred = await createUserWithEmailAndPassword(auth, cleanEmail, password);
            if (userCred && userCred.user) {
                try {
                    await updateProfile(userCred.user, { displayName: cleanName });
                } catch (pErr) {}

                cloudUser = {
                    uid: userCred.user.uid,
                    displayName: cleanName,
                    email: cleanEmail,
                    passwordHash: pHash,
                    createdAt: new Date().toISOString()
                };
            }
        } catch (fbErr) {
            console.warn("Firebase Auth create attempt:", fbErr);
            if (fbErr.code === "auth/email-already-in-use") {
                throw fbErr;
            }
        }

        if (!cloudUser) {
            cloudUser = {
                uid: "user_" + Date.now() + "_" + Math.random().toString(36).substring(2, 8),
                displayName: cleanName,
                email: cleanEmail,
                passwordHash: pHash,
                createdAt: new Date().toISOString()
            };
        }

        // 2. Direct Cloud Firestore write
        try {
            const userRef = doc(db, "usuarios", docId);
            await setDoc(userRef, cloudUser, { merge: true });
        } catch (dbErr) {
            console.warn("Firestore user setDoc notice:", dbErr);
        }

        // 3. Server backend synchronization
        try {
            await fetch('/api/auth/register', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    name: cleanName,
                    email: cleanEmail,
                    password: password,
                    passwordHash: pHash
                })
            });
        } catch (sErr) {
            console.warn("Server auth register notice:", sErr);
        }

        // 4. Local storage cache & active session
        LocalAuthStore.saveCloudUserLocal(cloudUser, password);
        LocalAuthStore.setCurrentUser(cloudUser);
        return cloudUser;
    },

    async loginUser(email, password) {
        const cleanEmail = email.trim().toLowerCase();
        const docId = getUserDocId(cleanEmail);
        const pHash = await hashUserPassword(password);

        // 1. Try Firebase Auth first
        try {
            const cred = await signInWithEmailAndPassword(auth, cleanEmail, password);
            if (cred && cred.user) {
                const loggedIn = {
                    uid: cred.user.uid,
                    displayName: cred.user.displayName || cleanEmail.split("@")[0],
                    email: cred.user.email || cleanEmail,
                    passwordHash: pHash,
                    createdAt: new Date().toISOString()
                };
                LocalAuthStore.saveCloudUserLocal(loggedIn, password);
                LocalAuthStore.setCurrentUser(loggedIn);
                try {
                    await setDoc(doc(db, "usuarios", docId), loggedIn, { merge: true });
                } catch (e) {}
                return loggedIn;
            }
        } catch (fbErr) {
            console.warn("Firebase Auth signIn attempt:", fbErr);
            if (fbErr.code === "auth/wrong-password") {
                throw fbErr;
            }
        }

        // 2. Direct Cloud Firestore user lookup (cross-device & incognito support)
        try {
            let userData = null;
            const userRef = doc(db, "usuarios", docId);
            const snap = await getDoc(userRef);

            if (snap.exists()) {
                userData = snap.data();
            } else {
                // Try query by email field if document ID was different
                const q = query(collection(db, "usuarios"), where("email", "==", cleanEmail));
                const qSnap = await getDocs(q);
                if (!qSnap.empty) {
                    userData = qSnap.docs[0].data();
                }
            }

            if (userData) {
                const storedHash = userData.passwordHash;
                const storedPlain = userData.password;
                const isMatch = (storedHash && storedHash === pHash) || (storedPlain && storedPlain === password);

                if (!isMatch) {
                    throw { code: "auth/wrong-password", message: "Wrong password" };
                }

                if (!storedHash) {
                    try {
                        await setDoc(userRef, { passwordHash: pHash }, { merge: true });
                    } catch (e) {}
                }

                const userObj = {
                    uid: userData.uid || ("user_" + Date.now()),
                    displayName: userData.displayName || cleanEmail.split("@")[0],
                    email: userData.email || cleanEmail,
                    createdAt: userData.createdAt || new Date().toISOString()
                };

                LocalAuthStore.saveCloudUserLocal(userObj, password);
                LocalAuthStore.setCurrentUser(userObj);

                // Sync with server in background
                fetch('/api/auth/register', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ name: userObj.displayName, email: cleanEmail, password, passwordHash: pHash })
                }).catch(() => {});

                return userObj;
            }
        } catch (dbErr) {
            if (dbErr.code === "auth/wrong-password") throw dbErr;
            console.warn("Firestore lookup error:", dbErr);
        }

        // 3. Server backend lookup
        try {
            const sRes = await fetch('/api/auth/login', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ email: cleanEmail, password, passwordHash: pHash })
            });
            if (sRes.ok) {
                const sData = await sRes.json();
                if (sData.user) {
                    LocalAuthStore.saveCloudUserLocal(sData.user, password);
                    LocalAuthStore.setCurrentUser(sData.user);
                    // Sync back to Firestore
                    try {
                        await setDoc(doc(db, "usuarios", docId), { ...sData.user, passwordHash: pHash }, { merge: true });
                    } catch (e) {}
                    return sData.user;
                }
            } else {
                const errData = await sRes.json().catch(() => ({}));
                if (errData.code === "auth/wrong-password") {
                    throw { code: "auth/wrong-password", message: "Wrong password" };
                }
            }
        } catch (sErr) {
            if (sErr.code === "auth/wrong-password") throw sErr;
            console.warn("Server login attempt error:", sErr);
        }

        // 4. Fallback to LocalAuthStore if external services are offline
        const localUser = LocalAuthStore.login(cleanEmail, password);
        return localUser;
    },

    async resetPassword(email) {
        const cleanEmail = email.trim().toLowerCase();
        const docId = getUserDocId(cleanEmail);

        try {
            await sendPasswordResetEmail(auth, cleanEmail);
            return true;
        } catch (e) {
            try {
                const userRef = doc(db, "usuarios", docId);
                const snap = await getDoc(userRef);
                if (snap.exists()) {
                    return true;
                }
            } catch (dbErr) {}

            try {
                const localUsers = LocalAuthStore.getUsers();
                if (localUsers.some(u => (u.email || "").toLowerCase().trim() === cleanEmail)) {
                    return true;
                }
            } catch (lErr) {}

            throw { code: "auth/user-not-found", message: "User not found" };
        }
    },

    // Sync any pre-existing local accounts to Firestore & Backend Cloud on initialization
    async syncAllLocalUsersToFirestore() {
        try {
            const localUsers = LocalAuthStore.getUsers();
            if (!localUsers || localUsers.length === 0) return;

            // Sync to backend server
            fetch('/api/auth/sync', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ users: localUsers })
            }).catch(() => {});

            // Sync to Firestore
            for (const u of localUsers) {
                if (!u || !u.email) continue;
                const docId = getUserDocId(u.email);
                const userRef = doc(db, "usuarios", docId);
                const snap = await getDoc(userRef);
                if (!snap.exists()) {
                    const pHash = u.passwordHash || (u.password ? await hashUserPassword(u.password) : "");
                    await setDoc(userRef, {
                        uid: u.uid || ("user_" + Date.now()),
                        displayName: u.displayName || u.email.split("@")[0],
                        email: u.email.toLowerCase().trim(),
                        passwordHash: pHash,
                        createdAt: u.createdAt || new Date().toISOString()
                    });
                }
            }
        } catch (e) {
            console.warn("Background user sync:", e);
        }
    }
};

// Start background user sync to Firebase Firestore & Server
CloudAuthService.syncAllLocalUsersToFirestore();

function isFirebaseApiKeyInvalid(err) {
    if (!err) return false;
    const code = String(err.code || "").toLowerCase();
    const msg = String(err.message || "").toLowerCase();
    return code.includes("api-key") || msg.includes("api-key") || msg.includes("api key") || code.includes("internal-error") || code.includes("invalid-credential");
}

// User Auth DOM Elements
const authHeaderBtn = document.getElementById("authHeaderBtn");
const authBtnLabel = document.getElementById("authBtnLabel");
const authBtnIconWrap = document.getElementById("authBtnIconWrap");
const userAuthDropdown = document.getElementById("userAuthDropdown");
const userProfileMenu = document.getElementById("userProfileMenu");
const userProfileAvatar = document.getElementById("userProfileAvatar");
const userProfileName = document.getElementById("userProfileName");
const userProfileEmail = document.getElementById("userProfileEmail");
const userProfileStatusVal = document.getElementById("userProfileStatusVal");
const userLogoutBtn = document.getElementById("userLogoutBtn");

const userAuthOverlay = document.getElementById("userAuthOverlay");
const userAuthClose = document.getElementById("userAuthClose");
const authTabsNav = document.getElementById("authTabsNav");
const authTabLogin = document.getElementById("authTabLogin");
const authTabRegister = document.getElementById("authTabRegister");

const authLoginSub = document.getElementById("authLoginSub");
const authRegisterSub = document.getElementById("authRegisterSub");
const authResetSub = document.getElementById("authResetSub");

const authAlertBox = document.getElementById("authAlertBox");
const authAlertText = document.getElementById("authAlertText");

const userLoginForm = document.getElementById("userLoginForm");
const loginEmailInput = document.getElementById("loginEmailInput");
const loginPasswordInput = document.getElementById("loginPasswordInput");
const toggleLoginPwdBtn = document.getElementById("toggleLoginPwdBtn");
const loginSubmitBtn = document.getElementById("loginSubmitBtn");
const loginCancelBtn = document.getElementById("loginCancelBtn");
const authForgotBtn = document.getElementById("authForgotBtn");

const userRegisterForm = document.getElementById("userRegisterForm");
const registerNameInput = document.getElementById("registerNameInput");
const registerEmailInput = document.getElementById("registerEmailInput");
const registerPasswordInput = document.getElementById("registerPasswordInput");
const toggleRegisterPwdBtn = document.getElementById("toggleRegisterPwdBtn");
const registerSubmitBtn = document.getElementById("registerSubmitBtn");
const registerCancelBtn = document.getElementById("registerCancelBtn");

const userResetForm = document.getElementById("userResetForm");
const resetEmailInput = document.getElementById("resetEmailInput");
const resetSubmitBtn = document.getElementById("resetSubmitBtn");
const resetBackBtn = document.getElementById("resetBackBtn");

var activeUserAuth = null;
var currentAuthTab = "login";
var isFantasyModuleInitialized = false;
window.isFantasyModuleInitialized = false;

// Helper: Show Alert inside Auth Modal
function showAuthAlert(message, type = "error") {
    if (!authAlertBox || !authAlertText) return;
    authAlertText.textContent = message;
    authAlertBox.className = "auth-alert-box " + (type === "success" ? "success" : "error");
    authAlertBox.style.display = "flex";
}

function clearAuthAlert() {
    if (!authAlertBox) return;
    authAlertBox.style.display = "none";
    if (authAlertText) authAlertText.textContent = "";
}

// Friendly Firebase Error Messages
function getAuthErrorMessage(errCode) {
    const isEn = currentLanguage === "en";
    const str = String(errCode || "").toLowerCase();

    if (str.includes("invalid-email")) {
        return isEn ? "Invalid email address format." : "Formato de correo electrónico inválido.";
    }
    if (str.includes("user-not-found") || str.includes("wrong-password") || str.includes("invalid-credential")) {
        return isEn ? "Incorrect email or password. Please try again." : "Correo o contraseña incorrectos. Verifica tus datos.";
    }
    if (str.includes("email-already-in-use")) {
        return isEn ? "This email is already registered. Please log in instead." : "Este correo electrónico ya está registrado. Inicia sesión.";
    }
    if (str.includes("weak-password")) {
        return isEn ? "Password is too weak. Please use at least 6 characters." : "La contraseña es muy débil. Debe tener al menos 6 caracteres.";
    }
    if (str.includes("user-disabled")) {
        return isEn ? "This account has been disabled." : "Esta cuenta de usuario ha sido deshabilitada.";
    }
    if (str.includes("too-many-requests")) {
        return isEn ? "Too many attempts. Please try again later." : "Demasiados intentos fallidos. Inténtalo más tarde.";
    }
    if (str.includes("network-request-failed")) {
        return isEn ? "Network error. Please check your internet connection." : "Error de red. Comprueba tu conexión a internet.";
    }
    return isEn ? "An authentication error occurred. Please try again." : "Ocurrió un error al autenticar. Por favor inténtalo de nuevo.";
}

// Switch between Login / Register / Reset Tabs
function switchUserAuthTab(tab) {
    currentAuthTab = tab;
    clearAuthAlert();

    if (userLoginForm) userLoginForm.style.display = tab === "login" ? "block" : "none";
    if (userRegisterForm) userRegisterForm.style.display = tab === "register" ? "block" : "none";
    if (userResetForm) userResetForm.style.display = tab === "reset" ? "block" : "none";

    if (authLoginSub) authLoginSub.style.display = tab === "login" ? "block" : "none";
    if (authRegisterSub) authRegisterSub.style.display = tab === "register" ? "block" : "none";
    if (authResetSub) authResetSub.style.display = tab === "reset" ? "block" : "none";

    if (authTabsNav) {
        authTabsNav.style.display = tab === "reset" ? "none" : "flex";
    }

    if (authTabLogin) {
        if (tab === "login") authTabLogin.classList.add("active");
        else authTabLogin.classList.remove("active");
    }
    if (authTabRegister) {
        if (tab === "register") authTabRegister.classList.add("active");
        else authTabRegister.classList.remove("active");
    }

    // Auto-focus first input
    setTimeout(() => {
        if (tab === "login" && loginEmailInput) loginEmailInput.focus();
        else if (tab === "register" && registerNameInput) registerNameInput.focus();
        else if (tab === "reset" && resetEmailInput) resetEmailInput.focus();
    }, 60);
}

// Open and Close Modal
function openUserAuthModal(tab = "login") {
    if (!userAuthOverlay) return;
    closeAllDropdowns();
    clearAuthAlert();
    switchUserAuthTab(tab);
    if (typeof setLanguage === "function") setLanguage(currentLanguage);
    userAuthOverlay.classList.add("active");
    document.body.classList.add("modal-open");
}

function closeUserAuthModal() {
    if (!userAuthOverlay) return;
    userAuthOverlay.classList.remove("active");
    if (!adminPanelOverlay || !adminPanelOverlay.classList.contains("active")) {
        document.body.classList.remove("modal-open");
    }
    clearAuthAlert();
    if (userLoginForm) userLoginForm.reset();
    if (userRegisterForm) userRegisterForm.reset();
    if (userResetForm) userResetForm.reset();
}

// Update UI on Auth State Change
function renderUserAuthState(user) {
    activeUserAuth = user;
    const dict = translations[currentLanguage] || translations.es;
    const isAdmin = isUserAdmin(user);

    if (user) {
        // User logged in
        const displayName = user.displayName || (user.email ? user.email.split("@")[0] : "Piloto");
        const initial = displayName.charAt(0).toUpperCase();

        if (authHeaderBtn) {
            authHeaderBtn.classList.add("is-logged-in");
            authHeaderBtn.setAttribute("title", user.email || displayName);
        }
        if (authBtnLabel) {
            authBtnLabel.dataset.customName = "true";
            authBtnLabel.textContent = displayName.toUpperCase();
        }
        if (authBtnIconWrap) {
            authBtnIconWrap.innerHTML = `<span class="user-header-avatar">${initial}</span>`;
        }

        if (userProfileAvatar) userProfileAvatar.textContent = initial;
        if (userProfileName) userProfileName.textContent = displayName;
        if (userProfileEmail) userProfileEmail.textContent = user.email || "";

        if (userProfileStatusVal) {
            if (isAdmin) {
                userProfileStatusVal.textContent = dict.auth && dict.auth.statusAdmin ? dict.auth.statusAdmin : "ADMINISTRADOR";
                userProfileStatusVal.className = "user-profile-badge user-badge-admin";
            } else {
                userProfileStatusVal.textContent = dict.auth && dict.auth.statusConnected ? dict.auth.statusConnected : "CONECTADO";
                userProfileStatusVal.className = "user-profile-badge user-badge-connected";
            }
        }

        if (userAdminShortcut) {
            userAdminShortcut.style.display = isAdmin ? "block" : "none";
        }
        if (headerAdminBtn) {
            headerAdminBtn.style.display = isAdmin ? "inline-flex" : "none";
        }
        if (typeof syncUserFantasyTeamFromCloud === "function") {
            syncUserFantasyTeamFromCloud(user);
        }
        if (isFantasyModuleInitialized && typeof renderFantasyPortal === "function") {
            renderFantasyPortal();
        }

    } else {
        // User logged out
        if (authHeaderBtn) {
            authHeaderBtn.classList.remove("is-logged-in");
            authHeaderBtn.removeAttribute("title");
        }
        if (authBtnLabel) {
            delete authBtnLabel.dataset.customName;
            authBtnLabel.textContent = dict.auth ? dict.auth.btnLabel : "INICIAR SESIÓN";
        }
        if (authBtnIconWrap) {
            authBtnIconWrap.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="16" height="16" fill="currentColor"><path d="M12 12c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm0 2c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4z"/></svg>`;
        }
        if (userAdminShortcut) {
            userAdminShortcut.style.display = "none";
        }
        if (headerAdminBtn) {
            headerAdminBtn.style.display = "none";
        }
        if (isFantasyModuleInitialized && typeof renderFantasyPortal === "function") {
            renderFantasyPortal();
        }
    }
}

// Initialize from local user store if present
const initialSavedLocalUser = LocalAuthStore.getCurrentUser();
if (initialSavedLocalUser) {
    renderUserAuthState(initialSavedLocalUser);
}

// Synchronize user claim state across activeUserAuth, activeUserData, and currentPilotos
function syncUserClaimWithPilotos() {
    if (!activeUserAuth) return;

    const userEmailClean = activeUserAuth.email ? activeUserAuth.email.trim().toLowerCase() : "";
    const userUid = activeUserAuth.uid || "";

    if (currentPilotos && currentPilotos.length > 0) {
        const matchedP = currentPilotos.find(p => {
            const pEmail = p.claimedByEmail ? p.claimedByEmail.trim().toLowerCase() : "";
            const pUid = p.claimedByUid || "";
            return (userEmailClean && pEmail === userEmailClean) || (userUid && pUid === userUid);
        });

        if (matchedP && (matchedP.isVerified || matchedP.claimedByEmail)) {
            activeUserData = {
                ...activeUserData,
                uid: activeUserAuth.uid,
                email: activeUserAuth.email,
                claimedDriver: matchedP.driver,
                claimedTeam: matchedP.team || "Independent",
                claimedDriverId: matchedP.id || getPilotDocId(matchedP.driver),
                isVerified: true,
                avatarUrl: matchedP.avatarUrl || (activeUserData ? activeUserData.avatarUrl : null),
                cardColor: matchedP.cardColor || (activeUserData ? activeUserData.cardColor : null),
                customFlag: matchedP.customFlag || (activeUserData ? activeUserData.customFlag : null),
                bio: matchedP.bio || (activeUserData ? activeUserData.bio : null),
                socialTwitch: matchedP.socialTwitch || (activeUserData ? activeUserData.socialTwitch : null),
                socialYoutube: matchedP.socialYoutube || (activeUserData ? activeUserData.socialYoutube : null),
                socialTwitter: matchedP.socialTwitter || (activeUserData ? activeUserData.socialTwitter : null),
                socialDiscord: matchedP.socialDiscord || (activeUserData ? activeUserData.socialDiscord : null)
            };
            if (typeof renderUserClaimState === "function") {
                renderUserClaimState(activeUserData);
            }
            return;
        }
    }

    if (activeUserData && activeUserData.isVerified && activeUserData.claimedDriver) {
        if (typeof renderUserClaimState === "function") {
            renderUserClaimState(activeUserData);
        }
    }
}

let activeUserData = null;
let unsubscribeUserDoc = null;

// Listen to Firebase Auth state
onAuthStateChanged(auth, (user) => {
    if (user) {
        LocalAuthStore.setCurrentUser({
            uid: user.uid,
            displayName: user.displayName || (user.email ? user.email.split("@")[0] : "Piloto"),
            email: user.email,
            createdAt: new Date().toISOString()
        });
        renderUserAuthState(user);

        if (unsubscribeUserDoc) unsubscribeUserDoc();
        const userDocRef = doc(db, "usuarios", user.uid);
        unsubscribeUserDoc = onSnapshot(userDocRef, (snap) => {
            if (snap.exists()) {
                activeUserData = { ...snap.data(), ...activeUserData };
                if (typeof renderUserClaimState === "function") {
                    renderUserClaimState(activeUserData);
                }
            } else if (user.email) {
                const emailDocRef = doc(db, "usuarios", getUserDocId(user.email));
                getDoc(emailDocRef).then(eSnap => {
                    if (eSnap.exists()) {
                        activeUserData = { ...eSnap.data(), ...activeUserData };
                        if (typeof renderUserClaimState === "function") {
                            renderUserClaimState(activeUserData);
                        }
                    }
                }).catch(() => {});
            }
            syncUserClaimWithPilotos();
        });
    } else {
        if (unsubscribeUserDoc) {
            unsubscribeUserDoc();
            unsubscribeUserDoc = null;
        }
        const local = LocalAuthStore.getCurrentUser();
        if (local) {
            renderUserAuthState(local);
            const userUid = local.uid || "";
            const userEmail = local.email || "";

            if (userUid) {
                getDoc(doc(db, "usuarios", userUid)).then(snap => {
                    if (snap.exists()) {
                        activeUserData = snap.data();
                        renderUserClaimState(activeUserData);
                    } else if (userEmail) {
                        getDoc(doc(db, "usuarios", getUserDocId(userEmail))).then(eSnap => {
                            if (eSnap.exists()) {
                                activeUserData = eSnap.data();
                                renderUserClaimState(activeUserData);
                            }
                            syncUserClaimWithPilotos();
                        }).catch(() => syncUserClaimWithPilotos());
                    } else {
                        syncUserClaimWithPilotos();
                    }
                }).catch(() => syncUserClaimWithPilotos());
            } else {
                syncUserClaimWithPilotos();
            }
        } else {
            activeUserData = null;
            renderUserAuthState(null);
            if (typeof renderUserClaimState === "function") {
                renderUserClaimState(null);
            }
        }
    }
});

// Event Listeners for User Auth
if (authHeaderBtn) {
    authHeaderBtn.addEventListener("click", (e) => {
        e.stopPropagation();
        if (activeUserAuth) {
            // Logged in: toggle user profile menu
            if (!userAuthDropdown) return;
            const isOpen = userAuthDropdown.classList.contains("is-open");
            closeAllDropdowns();
            if (!isOpen) {
                userAuthDropdown.classList.add("is-open");
                authHeaderBtn.setAttribute("aria-expanded", "true");
            }
        } else {
            // Not logged in: open login modal
            openUserAuthModal("login");
        }
    });
}

// User Logout
if (userLogoutBtn) {
    userLogoutBtn.addEventListener("click", async (e) => {
        e.stopPropagation();
        try {
            await signOut(auth);
        } catch (e) {}
        LocalAuthStore.logout();
        renderUserAuthState(null);
        closeAllDropdowns();
    });
}

// Modal Closers & Tabs
if (userAuthClose) userAuthClose.addEventListener("click", closeUserAuthModal);
if (loginCancelBtn) loginCancelBtn.addEventListener("click", closeUserAuthModal);
if (registerCancelBtn) registerCancelBtn.addEventListener("click", closeUserAuthModal);

if (userAuthOverlay) {
    userAuthOverlay.addEventListener("click", (e) => {
        if (e.target === userAuthOverlay) closeUserAuthModal();
    });
}

if (authTabLogin) {
    authTabLogin.addEventListener("click", () => switchUserAuthTab("login"));
}
if (authTabRegister) {
    authTabRegister.addEventListener("click", () => switchUserAuthTab("register"));
}
if (authForgotBtn) {
    authForgotBtn.addEventListener("click", () => switchUserAuthTab("reset"));
}
if (resetBackBtn) {
    resetBackBtn.addEventListener("click", () => switchUserAuthTab("login"));
}

// Toggle password visibility
if (toggleLoginPwdBtn && loginPasswordInput) {
    toggleLoginPwdBtn.addEventListener("click", () => {
        const isPassword = loginPasswordInput.type === "password";
        loginPasswordInput.type = isPassword ? "text" : "password";
        toggleLoginPwdBtn.textContent = isPassword ? "🙈" : "👁";
    });
}

if (toggleRegisterPwdBtn && registerPasswordInput) {
    toggleRegisterPwdBtn.addEventListener("click", () => {
        const isPassword = registerPasswordInput.type === "password";
        registerPasswordInput.type = isPassword ? "text" : "password";
        toggleRegisterPwdBtn.textContent = isPassword ? "🙈" : "👁";
    });
}

// --- Login Form Submit ---
if (userLoginForm) {
    userLoginForm.addEventListener("submit", async (e) => {
        e.preventDefault();
        clearAuthAlert();

        const email = loginEmailInput ? loginEmailInput.value.trim() : "";
        const password = loginPasswordInput ? loginPasswordInput.value : "";

        if (!email || !password) {
            showAuthAlert(currentLanguage === "en" ? "Please fill in all fields." : "Por favor completa todos los campos.");
            return;
        }

        const isEn = currentLanguage === "en";
        const loginSubSpan = document.getElementById("loginSubmitBtnText");
        if (loginSubmitBtn) {
            loginSubmitBtn.disabled = true;
            if (loginSubSpan) loginSubSpan.textContent = isEn ? "LOGGING IN..." : "INICIANDO SESIÓN...";
            else loginSubmitBtn.textContent = isEn ? "LOGGING IN..." : "INICIANDO SESIÓN...";
        }

        try {
            const loggedInUser = await CloudAuthService.loginUser(email, password);

            if (loggedInUser) {
                renderUserAuthState(loggedInUser);
                closeUserAuthModal();
            }
        } catch (err) {
            console.error("Login error:", err);
            showAuthAlert(getAuthErrorMessage(err.code || err.message));
        } finally {
            if (loginSubmitBtn) {
                loginSubmitBtn.disabled = false;
                const dict = translations[currentLanguage] || translations.es;
                const text = dict.auth ? dict.auth.btnSubmitLogin : (isEn ? "LOG IN" : "INICIAR SESIÓN");
                loginSubmitBtn.innerHTML = `<span class="btn-text" id="loginSubmitBtnText">${text}</span>`;
            }
        }
    });
}

// --- Register Form Submit ---
if (userRegisterForm) {
    userRegisterForm.addEventListener("submit", async (e) => {
        e.preventDefault();
        clearAuthAlert();

        const name = registerNameInput ? registerNameInput.value.trim() : "";
        const email = registerEmailInput ? registerEmailInput.value.trim() : "";
        const password = registerPasswordInput ? registerPasswordInput.value : "";

        const isEn = currentLanguage === "en";

        if (!name || !email || !password) {
            showAuthAlert(isEn ? "Please fill in all fields." : "Por favor completa todos los campos.");
            return;
        }

        if (password.length < 6) {
            showAuthAlert(isEn ? "Password must have at least 6 characters." : "La contraseña debe tener al menos 6 caracteres.");
            return;
        }

        const regSubSpan = document.getElementById("registerSubmitBtnText");
        if (registerSubmitBtn) {
            registerSubmitBtn.disabled = true;
            if (regSubSpan) regSubSpan.textContent = isEn ? "CREATING ACCOUNT..." : "CREANDO CUENTA...";
            else registerSubmitBtn.textContent = isEn ? "CREATING ACCOUNT..." : "CREANDO CUENTA...";
        }

        try {
            const registeredUser = await CloudAuthService.registerUser(name, email, password);

            if (registeredUser) {
                renderUserAuthState(registeredUser);
                closeUserAuthModal();
            }
        } catch (err) {
            console.error("Registration error:", err);
            showAuthAlert(getAuthErrorMessage(err.code || err.message));
        } finally {
            if (registerSubmitBtn) {
                registerSubmitBtn.disabled = false;
                const dict = translations[currentLanguage] || translations.es;
                const text = dict.auth ? dict.auth.btnSubmitRegister : (isEn ? "CREATE ACCOUNT" : "CREAR CUENTA");
                registerSubmitBtn.innerHTML = `<span class="btn-text" id="registerSubmitBtnText">${text}</span>`;
            }
        }
    });
}

// --- Reset Password Form Submit ---
if (userResetForm) {
    userResetForm.addEventListener("submit", async (e) => {
        e.preventDefault();
        clearAuthAlert();

        const email = resetEmailInput ? resetEmailInput.value.trim() : "";
        const isEn = currentLanguage === "en";

        if (!email) {
            showAuthAlert(isEn ? "Please enter your email address." : "Por favor ingresa tu correo electrónico.");
            return;
        }

        const resetSubSpan = document.getElementById("resetSubmitBtnText");
        if (resetSubmitBtn) {
            resetSubmitBtn.disabled = true;
            if (resetSubSpan) resetSubSpan.textContent = isEn ? "SENDING..." : "ENVIANDO...";
            else resetSubmitBtn.textContent = isEn ? "SENDING..." : "ENVIANDO...";
        }

        try {
            await CloudAuthService.resetPassword(email);
            showAuthAlert(
                isEn
                    ? "Password reset request processed. If an account exists, instructions have been prepared."
                    : "Solicitud procesada. Si la cuenta existe, se enviarán las instrucciones.",
                "success"
            );
            if (resetEmailInput) resetEmailInput.value = "";
        } catch (err) {
            console.error("Password reset error:", err);
            showAuthAlert(getAuthErrorMessage(err.code || err.message));
        } finally {
            if (resetSubmitBtn) {
                resetSubmitBtn.disabled = false;
                const dict = translations[currentLanguage] || translations.es;
                const text = dict.auth ? dict.auth.btnSubmitReset : (isEn ? "SEND LINK" : "ENVIAR ENLACE");
                resetSubmitBtn.innerHTML = `<span class="btn-text" id="resetSubmitBtnText">${text}</span>`;
            }
        }
    });
}

/* =========================================================
   VERIFICATION & DRIVER CLAIMING SYSTEM (FIREBASE SYNC)
========================================================= */

// Elements for User Profile Claiming
const userClaimForm = document.getElementById("userClaimForm");
const userClaimCodeInput = document.getElementById("userClaimCodeInput");
const userClaimNotice = document.getElementById("userClaimNotice");
const userClaimUnverified = document.getElementById("userClaimUnverified");
const userClaimVerified = document.getElementById("userClaimVerified");
const userClaimedDriverName = document.getElementById("userClaimedDriverName");
const userClaimedTeamName = document.getElementById("userClaimedTeamName");
const userUnlinkDriverBtn = document.getElementById("userUnlinkDriverBtn");

// Helper: Generate unique verification code
function generateDriverVerificationCode() {
    return "FF-" + Math.floor(100000 + Math.random() * 900000);
}

// Render claim state inside user profile dropdown
function renderUserClaimState(uData) {
    if (uData && uData.timezone && TIMEZONES.some(t => t.id === uData.timezone)) {
        if (selectedTimezone !== uData.timezone) {
            setTimezone(uData.timezone);
        }
    }

    if (uData && uData.isVerified && uData.claimedDriver) {
        if (userClaimUnverified) userClaimUnverified.style.display = "none";
        if (userClaimVerified) userClaimVerified.style.display = "block";
        if (userUnlinkDriverBtn) userUnlinkDriverBtn.style.display = "flex";
        if (userClaimedDriverName) userClaimedDriverName.textContent = uData.claimedDriver;
        if (userClaimedTeamName) userClaimedTeamName.textContent = uData.claimedTeam || "Equipo Oficial";
        if (authBtnLabel && authBtnLabel.dataset.customName) {
            authBtnLabel.textContent = `${uData.claimedDriver.toUpperCase()} (VERIFICADO)`;
        }
        populateUserCardEditor(uData);
    } else {
        if (userClaimUnverified) userClaimUnverified.style.display = "block";
        if (userClaimVerified) userClaimVerified.style.display = "none";
        if (userUnlinkDriverBtn) userUnlinkDriverBtn.style.display = "none";
        if (userClaimNotice) {
            userClaimNotice.textContent = "";
            userClaimNotice.style.color = "";
        }
    }
}

// User Profile - Submit Verification Code
if (userClaimForm) {
    userClaimForm.addEventListener("submit", async (e) => {
        e.preventDefault();
        if (!activeUserAuth) {
            if (userClaimNotice) {
                userClaimNotice.textContent = "Debes iniciar sesión para verificar tu piloto.";
                userClaimNotice.style.color = "#f85149";
            }
            return;
        }

        const rawCode = userClaimCodeInput ? userClaimCodeInput.value.trim().toUpperCase() : "";
        if (!rawCode) return;

        if (userClaimNotice) {
            userClaimNotice.textContent = "Verificando código...";
            userClaimNotice.style.color = "#8b949e";
        }

        try {
            // Query Firestore 'pilotos' collection for code
            const q = query(collection(db, "pilotos"), where("verificationCode", "==", rawCode));
            const querySnap = await getDocs(q);

            let matchedDriverDoc = null;
            let matchedDriverData = null;

            if (!querySnap.empty) {
                matchedDriverDoc = querySnap.docs[0];
                matchedDriverData = matchedDriverDoc.data();
            } else {
                // Fallback check in memory
                const foundInLocal = (currentPilotos || []).find(p => (p.verificationCode || "").toUpperCase() === rawCode);
                if (foundInLocal) {
                    matchedDriverData = foundInLocal;
                    matchedDriverDoc = { id: foundInLocal.id || getPilotDocId(foundInLocal.driver) };
                }
            }

            if (!matchedDriverData || !matchedDriverDoc) {
                if (userClaimNotice) {
                    userClaimNotice.textContent = "❌ Código inválido. Solicita un código válido a hermesalo o adriii.lr en Discord.";
                    userClaimNotice.style.color = "#f85149";
                }
                return;
            }

            if (matchedDriverData.claimedByUid && matchedDriverData.claimedByUid !== activeUserAuth.uid) {
                if (userClaimNotice) {
                    userClaimNotice.textContent = "❌ Este piloto ya está vinculado a otra cuenta.";
                    userClaimNotice.style.color = "#f85149";
                }
                return;
            }

            // Save in Firestore with writeBatch
            const batch = writeBatch(db);

            // 1. Update driver doc in 'pilotos'
            const pilotRef = doc(db, "pilotos", matchedDriverDoc.id);
            batch.set(pilotRef, {
                driver: matchedDriverData.driver,
                team: matchedDriverData.team || "Independent",
                claimedByEmail: activeUserAuth.email,
                claimedByUid: activeUserAuth.uid,
                isVerified: true,
                verifiedAt: new Date().toISOString()
            }, { merge: true });

            const standardPilotId = getPilotDocId(matchedDriverData.driver);
            if (standardPilotId && standardPilotId !== matchedDriverDoc.id) {
                batch.set(doc(db, "pilotos", standardPilotId), {
                    driver: matchedDriverData.driver,
                    team: matchedDriverData.team || "Independent",
                    claimedByEmail: activeUserAuth.email,
                    claimedByUid: activeUserAuth.uid,
                    isVerified: true,
                    verifiedAt: new Date().toISOString()
                }, { merge: true });
            }

            const claimPayload = {
                uid: activeUserAuth.uid,
                email: activeUserAuth.email,
                displayName: activeUserAuth.displayName || matchedDriverData.driver,
                claimedDriver: matchedDriverData.driver,
                claimedTeam: matchedDriverData.team || "Independent",
                claimedDriverId: matchedDriverDoc.id,
                isVerified: true,
                verifiedAt: new Date().toISOString()
            };

            // 2. Update user doc by UID
            const userRef = doc(db, "usuarios", activeUserAuth.uid);
            batch.set(userRef, claimPayload, { merge: true });

            // 3. Update user doc by Email Doc ID for cross-resolution
            if (activeUserAuth.email) {
                const userRef2 = doc(db, "usuarios", getUserDocId(activeUserAuth.email));
                batch.set(userRef2, claimPayload, { merge: true });
            }

            await batch.commit();

            if (userClaimCodeInput) userClaimCodeInput.value = "";
            if (userClaimNotice) {
                userClaimNotice.textContent = `¡Verificado con éxito como ${matchedDriverData.driver}!`;
                userClaimNotice.style.color = "#10b981";
            }

            // Register in globalVerifiedUsersMap
            if (typeof window !== "undefined") {
                if (!window.globalVerifiedUsersMap) window.globalVerifiedUsersMap = new Map();
                window.globalVerifiedUsersMap.set(normalizeDriverKey(matchedDriverData.driver), {
                    driver: matchedDriverData.driver,
                    email: activeUserAuth.email,
                    uid: activeUserAuth.uid,
                    isVerified: true,
                    verifiedAt: new Date().toISOString()
                });
            }

            // Update in-memory pilot data in currentPilotos
            if (currentPilotos) {
                const targetP = currentPilotos.find(p => (p.id || getPilotDocId(p.driver)) === matchedDriverDoc.id || normalizeDriverKey(p.driver) === normalizeDriverKey(matchedDriverData.driver));
                if (targetP) {
                    targetP.claimedByEmail = activeUserAuth.email;
                    targetP.claimedByUid = activeUserAuth.uid;
                    targetP.isVerified = true;
                }
            }

            activeUserData = { ...activeUserData, ...claimPayload };
            renderUserClaimState(activeUserData);
            syncUserClaimWithPilotos();

            if (typeof renderAdminVerifyTab === "function") {
                renderAdminVerifyTab(typeof adminSearchVerifyPilotInput !== "undefined" && adminSearchVerifyPilotInput ? adminSearchVerifyPilotInput.value : "");
            }

        } catch (err) {
            console.error("Error al verificar código de piloto:", err);
            if (userClaimNotice) {
                userClaimNotice.textContent = "Error al procesar la verificación en la base de datos.";
                userClaimNotice.style.color = "#f85149";
            }
        }
    });
}

// User Profile - Unlink Driver
if (userUnlinkDriverBtn) {
    userUnlinkDriverBtn.addEventListener("click", async () => {
        if (!activeUserAuth || !activeUserData) return;
        if (!confirm("¿Seguro que deseas desvincular tu cuenta de piloto oficial?")) return;

        try {
            const batch = writeBatch(db);

            const driverDocId = activeUserData.claimedDriverId || (activeUserData.claimedDriver ? getPilotDocId(activeUserData.claimedDriver) : null);
            if (driverDocId) {
                batch.set(doc(db, "pilotos", driverDocId), {
                    claimedByEmail: null,
                    claimedByUid: null,
                    isVerified: false
                }, { merge: true });
            }
            if (activeUserData.claimedDriver) {
                const altId = getPilotDocId(activeUserData.claimedDriver);
                if (altId && altId !== driverDocId) {
                    batch.set(doc(db, "pilotos", altId), {
                        claimedByEmail: null,
                        claimedByUid: null,
                        isVerified: false
                    }, { merge: true });
                }
            }

            const unlinkPayload = {
                claimedDriver: null,
                claimedTeam: null,
                claimedDriverId: null,
                isVerified: false
            };

            batch.set(doc(db, "usuarios", activeUserAuth.uid), unlinkPayload, { merge: true });
            if (activeUserAuth.email) {
                batch.set(doc(db, "usuarios", getUserDocId(activeUserAuth.email)), unlinkPayload, { merge: true });
            }

            await batch.commit();

            if (currentPilotos && (driverDocId || activeUserData.claimedDriver)) {
                const targetP = currentPilotos.find(p => (p.id || getPilotDocId(p.driver)) === driverDocId || (activeUserData.claimedDriver && normalizeDriverKey(p.driver) === normalizeDriverKey(activeUserData.claimedDriver)));
                if (targetP) {
                    targetP.claimedByEmail = null;
                    targetP.claimedByUid = null;
                    targetP.isVerified = false;
                }
            }

            if (typeof window !== "undefined" && window.globalVerifiedUsersMap && activeUserData.claimedDriver) {
                window.globalVerifiedUsersMap.delete(normalizeDriverKey(activeUserData.claimedDriver));
            }

            activeUserData = { ...activeUserData, isVerified: false, claimedDriver: null };
            renderUserClaimState(activeUserData);
            if (typeof renderAdminVerifyTab === "function") {
                renderAdminVerifyTab(typeof adminSearchVerifyPilotInput !== "undefined" && adminSearchVerifyPilotInput ? adminSearchVerifyPilotInput.value : "");
            }

        } catch (err) {
            console.error("Error al desvincular piloto:", err);
        }
    });
}

// Admin Panel - Refresh Verification Data from Firestore
async function refreshAdminVerificationData() {
    try {
        if (typeof db !== "undefined") {
            // 1. Fetch from 'usuarios' collection to ensure any verified pilot accounts are captured
            const usersSnap = await getDocs(collection(db, "usuarios"));
            if (!usersSnap.empty) {
                if (typeof window !== "undefined") {
                    if (!window.globalVerifiedUsersMap) window.globalVerifiedUsersMap = new Map();
                }
                usersSnap.forEach(uDoc => {
                    const uData = uDoc.data();
                    if (uData && (uData.isVerified || uData.claimedDriver)) {
                        const dName = uData.claimedDriver || (uData.isVerified ? (uData.displayName || uDoc.id) : null);
                        if (dName) {
                            if (typeof window !== "undefined" && window.globalVerifiedUsersMap) {
                                window.globalVerifiedUsersMap.set(normalizeDriverKey(dName), {
                                    driver: dName,
                                    email: uData.email || null,
                                    uid: uData.uid || uDoc.id,
                                    isVerified: uData.isVerified !== false,
                                    verifiedAt: uData.verifiedAt || null,
                                    avatarUrl: uData.avatarUrl || null,
                                    cardColor: uData.cardColor || null,
                                    customFlag: uData.customFlag || uData.flag || null,
                                    bio: uData.bio || null,
                                    socialTwitch: uData.socialTwitch || null,
                                    socialYoutube: uData.socialYoutube || null,
                                    socialTwitter: uData.socialTwitter || null,
                                    socialDiscord: uData.socialDiscord || null
                                });
                            }
                        }
                    }
                });
            }

            // 2. Fetch from 'pilotos' collection to ensure all verified flags and codes are captured
            const pilotosSnap = await getDocs(collection(db, "pilotos"));
            if (!pilotosSnap.empty) {
                pilotosSnap.forEach(pDoc => {
                    const pData = pDoc.data();
                    const dName = pData.driver || pDoc.id;
                    const norm = normalizeDriverKey(dName);
                    if (pData.isVerified || pData.claimedByEmail || pData.claimedByUid) {
                        if (typeof window !== "undefined" && window.globalVerifiedUsersMap) {
                            const existing = window.globalVerifiedUsersMap.get(norm) || {};
                            window.globalVerifiedUsersMap.set(norm, {
                                ...existing,
                                driver: dName,
                                email: pData.claimedByEmail || existing.email || null,
                                uid: pData.claimedByUid || existing.uid || null,
                                isVerified: true
                            });
                        }
                    }
                    if (Array.isArray(currentPilotos)) {
                        const target = currentPilotos.find(p => (p.id || getPilotDocId(p.driver)) === pDoc.id || normalizeDriverKey(p.driver) === norm);
                        if (target) {
                            if (pData.isVerified !== undefined) target.isVerified = !!pData.isVerified;
                            if (pData.claimedByEmail !== undefined) target.claimedByEmail = pData.claimedByEmail;
                            if (pData.claimedByUid !== undefined) target.claimedByUid = pData.claimedByUid;
                            if (pData.verificationCode !== undefined) target.verificationCode = pData.verificationCode;
                        }
                    }
                });
            }
        }
    } catch (err) {
        console.warn("Notice: refreshAdminVerificationData encountered non-blocking error:", err);
    }

    renderAdminVerifyTab(typeof adminSearchVerifyPilotInput !== "undefined" && adminSearchVerifyPilotInput ? adminSearchVerifyPilotInput.value : "");
}

// Admin Panel - Render Verification Tab
function renderAdminVerifyTab(filterTerm = "") {
    if (!adminVerifyDriverSelect || !adminVerifyTableBody) return;

    const list = (currentPilotos && currentPilotos.length > 0) ? currentPilotos : getSavedStandings();

    // Ensure verified data from globalVerifiedUsersMap is merged into list items
    if (typeof window !== "undefined" && window.globalVerifiedUsersMap && window.globalVerifiedUsersMap.size > 0) {
        list.forEach(p => {
            const norm = normalizeDriverKey(p.driver);
            if (window.globalVerifiedUsersMap.has(norm)) {
                const uInfo = window.globalVerifiedUsersMap.get(norm);
                p.isVerified = true;
                if (uInfo.email && !p.claimedByEmail) p.claimedByEmail = uInfo.email;
                if (uInfo.uid && !p.claimedByUid) p.claimedByUid = uInfo.uid;
            }
        });
    }

    // Calculate Verification Statistics & KPI Badges
    let verifiedCount = 0;
    let codeActiveCount = 0;
    let pendingCount = 0;

    list.forEach(p => {
        if (p.isVerified || p.claimedByEmail || p.claimedByUid) {
            verifiedCount++;
        } else if (p.verificationCode) {
            codeActiveCount++;
        } else {
            pendingCount++;
        }
    });

    if (adminVerifyTotalPilots) adminVerifyTotalPilots.textContent = list.length;
    if (adminVerifyCountVerified) adminVerifyCountVerified.textContent = verifiedCount;
    if (adminVerifyCountActiveCodes) adminVerifyCountActiveCodes.textContent = codeActiveCount;
    if (adminVerifyCountPending) adminVerifyCountPending.textContent = pendingCount;
    if (adminTabVerifyBadge) adminTabVerifyBadge.textContent = verifiedCount;
    if (adminQuickVerifiedCount) adminQuickVerifiedCount.textContent = `${verifiedCount} / ${list.length}`;

    // Populate Select Dropdown
    const currentSelVal = adminVerifyDriverSelect.value;
    adminVerifyDriverSelect.innerHTML = `<option value="">-- Seleccionar piloto oficial --</option>`;
    list.forEach(p => {
        const pId = p.id || getPilotDocId(p.driver);
        const isDriverVer = Boolean(p.isVerified || p.claimedByEmail || p.claimedByUid);
        const opt = document.createElement("option");
        opt.value = pId;
        opt.textContent = `${p.driver} (${p.team})${isDriverVer ? " [VERIFICADO]" : (p.verificationCode ? " [CÓDIGO GENERADO]" : "")}`;
        if (pId === currentSelVal) opt.selected = true;
        adminVerifyDriverSelect.appendChild(opt);
    });

    // Populate Table with Status & Search Filters
    const statusFilter = adminFilterVerifyStatus ? adminFilterVerifyStatus.value : "all";
    const searchKey = (filterTerm || (adminSearchVerifyPilotInput ? adminSearchVerifyPilotInput.value : "")).trim().toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
    
    const filtered = list.filter(p => {
        const isVer = Boolean(p.isVerified || p.claimedByEmail || p.claimedByUid);
        const hasCode = Boolean(p.verificationCode && !isVer);
        const isPend = !isVer && !hasCode;

        if (statusFilter === "verified" && !isVer) return false;
        if (statusFilter === "code" && !hasCode) return false;
        if (statusFilter === "pending" && !isPend) return false;

        if (!searchKey) return true;
        const nameNorm = p.driver.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
        const teamNorm = p.team.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
        const codeNorm = (p.verificationCode || "").toLowerCase();
        const emailNorm = (p.claimedByEmail || "").toLowerCase();
        return nameNorm.includes(searchKey) || teamNorm.includes(searchKey) || codeNorm.includes(searchKey) || emailNorm.includes(searchKey);
    });

    adminVerifyTableBody.innerHTML = "";

    if (filtered.length === 0) {
        adminVerifyTableBody.innerHTML = `
            <tr>
                <td colspan="7" style="text-align: center; padding: 20px; color: #8c929c;">
                    No se encontraron pilotos que coincidan con la búsqueda o filtro.
                </td>
            </tr>
        `;
        return;
    }

    filtered.forEach((p, idx) => {
        const pId = p.id || getPilotDocId(p.driver);
        const isDriverVer = Boolean(p.isVerified || p.claimedByEmail || p.claimedByUid);
        const tr = document.createElement("tr");

        let statusBadge = `<span class="verify-badge-pending">PENDIENTE</span>`;
        if (isDriverVer) {
            statusBadge = `<span class="verify-badge-verified">VERIFICADO</span>`;
        } else if (p.verificationCode) {
            statusBadge = `<span class="verify-badge-code">CÓDIGO ACTIVO</span>`;
        }

        const activeCodeHtml = p.verificationCode 
            ? `<code style="font-family: monospace; font-size: 14px; font-weight: bold; color: var(--gold,#d6b45c);">${p.verificationCode}</code>` 
            : `<span style="color: #666;">—</span>`;

        const linkedAccountHtml = p.claimedByEmail 
            ? `<span style="color: #10b981; font-weight: 600;">${p.claimedByEmail}</span>` 
            : `<span style="color: #666;">—</span>`;

        tr.innerHTML = `
            <td style="font-weight: bold; color: #8c929c;">${idx + 1}</td>
            <td style="font-weight: 800; color: #fff;">${p.driver}</td>
            <td style="color: var(--gold, #d6b45c); font-weight: 600;">${p.team}</td>
            <td>${activeCodeHtml}</td>
            <td>${linkedAccountHtml}</td>
            <td>${statusBadge}</td>
            <td style="text-align: center;">
                <div style="display: flex; gap: 4px; justify-content: center;">
                    <button type="button" class="btn btn-primary btn-sm btn-gen-code" data-pid="${pId}" title="Generar / Renovar Código" style="padding: 3px 8px; font-size: 11px;">⚡</button>
                    ${p.verificationCode ? `<button type="button" class="btn btn-secondary btn-sm btn-copy-code" data-code="${p.verificationCode}" title="Copiar Código" style="padding: 3px 8px; font-size: 11px;">📋</button>` : ""}
                    ${(p.verificationCode || isDriverVer) ? `<button type="button" class="btn btn-danger-outline btn-sm btn-revoke-code" data-pid="${pId}" title="Revocar Código / Desvincular" style="padding: 3px 8px; font-size: 11px;">🗑️</button>` : ""}
                </div>
            </td>
        `;

        adminVerifyTableBody.appendChild(tr);
    });

    // Row Event Listeners
    adminVerifyTableBody.querySelectorAll(".btn-gen-code").forEach(btn => {
        btn.addEventListener("click", () => {
            const pId = btn.dataset.pid;
            generateAndSaveCodeForPilotId(pId);
        });
    });

    adminVerifyTableBody.querySelectorAll(".btn-copy-code").forEach(btn => {
        btn.addEventListener("click", () => {
            const code = btn.dataset.code;
            navigator.clipboard.writeText(code).then(() => {
                const orig = btn.textContent;
                btn.textContent = "✓";
                setTimeout(() => { btn.textContent = orig; }, 1500);
            });
        });
    });

    adminVerifyTableBody.querySelectorAll(".btn-revoke-code").forEach(btn => {
        btn.addEventListener("click", async () => {
            const pId = btn.dataset.pid;
            const pilot = list.find(item => (item.id || getPilotDocId(item.driver)) === pId);
            const pName = pilot ? pilot.driver : pId;

            if (!confirm(`¿Revocar el código y desvincular a ${pName}?`)) return;

            try {
                const batch = writeBatch(db);
                batch.set(doc(db, "pilotos", pId), {
                    verificationCode: null,
                    claimedByEmail: null,
                    claimedByUid: null,
                    isVerified: false
                }, { merge: true });

                const altDocId = pilot ? getPilotDocId(pilot.driver) : null;
                if (altDocId && altDocId !== pId) {
                    batch.set(doc(db, "pilotos", altDocId), {
                        verificationCode: null,
                        claimedByEmail: null,
                        claimedByUid: null,
                        isVerified: false
                    }, { merge: true });
                }

                if (pilot && pilot.claimedByUid) {
                    batch.set(doc(db, "usuarios", pilot.claimedByUid), {
                        isVerified: false,
                        claimedDriver: null,
                        claimedDriverId: null,
                        claimedTeam: null
                    }, { merge: true });
                }
                if (pilot && pilot.claimedByEmail) {
                    batch.set(doc(db, "usuarios", getUserDocId(pilot.claimedByEmail)), {
                        isVerified: false,
                        claimedDriver: null,
                        claimedDriverId: null,
                        claimedTeam: null
                    }, { merge: true });
                }

                await batch.commit();

                if (pilot) {
                    pilot.verificationCode = null;
                    pilot.claimedByEmail = null;
                    pilot.claimedByUid = null;
                    pilot.isVerified = false;
                }
                if (typeof window !== "undefined" && window.globalVerifiedUsersMap && pilot) {
                    window.globalVerifiedUsersMap.delete(normalizeDriverKey(pilot.driver));
                }

                renderAdminVerifyTab(adminSearchVerifyPilotInput ? adminSearchVerifyPilotInput.value : "");
            } catch (err) {
                console.error("Error al revocar código:", err);
            }
        });
    });
}

async function generateAndSaveCodeForPilotId(pId) {
    if (!pId) return;
    const list = (currentPilotos && currentPilotos.length > 0) ? currentPilotos : getSavedStandings();
    const pilot = list.find(item => (item.id || getPilotDocId(item.driver)) === pId);
    if (!pilot) return;

    const newCode = generateDriverVerificationCode();

    try {
        if (adminGenerateNotice) {
            adminGenerateNotice.textContent = "Generando código...";
            adminGenerateNotice.style.color = "#8b949e";
        }

        // Save directly to Firestore with merge: true to avoid crashes
        const batch = writeBatch(db);
        batch.set(doc(db, "pilotos", pId), {
            driver: pilot.driver,
            team: pilot.team || "Independent",
            verificationCode: newCode
        }, { merge: true });

        const altId = getPilotDocId(pilot.driver);
        if (altId && altId !== pId) {
            batch.set(doc(db, "pilotos", altId), {
                driver: pilot.driver,
                team: pilot.team || "Independent",
                verificationCode: newCode
            }, { merge: true });
        }
        await batch.commit();

        pilot.verificationCode = newCode;

        if (adminCodeOutputBox) adminCodeOutputBox.style.display = "block";
        if (adminGeneratedDriverName) adminGeneratedDriverName.textContent = pilot.driver.toUpperCase();
        if (adminGeneratedCodeDisplay) adminGeneratedCodeDisplay.textContent = newCode;
        if (adminGenerateNotice) {
            adminGenerateNotice.textContent = "✓ ¡Código generado exitosamente en Firestore!";
            adminGenerateNotice.style.color = "#10b981";
        }

        renderAdminVerifyTab(adminSearchVerifyPilotInput ? adminSearchVerifyPilotInput.value : "");

    } catch (err) {
        console.error("Error al guardar código en Firestore:", err);
        if (adminGenerateNotice) {
            adminGenerateNotice.textContent = "Error al guardar el código en Firestore: " + err.message;
            adminGenerateNotice.style.color = "#f85149";
        }
    }
}

// Admin - Generate Code Button
if (adminGenerateCodeBtn) {
    adminGenerateCodeBtn.addEventListener("click", () => {
        const pId = adminVerifyDriverSelect ? adminVerifyDriverSelect.value : "";
        if (!pId) {
            alert("Por favor selecciona un piloto de la lista desplegable.");
            return;
        }
        generateAndSaveCodeForPilotId(pId);
    });
}

// Admin - Copy Code Button
if (adminCopyCodeBtn) {
    adminCopyCodeBtn.addEventListener("click", () => {
        const code = adminGeneratedCodeDisplay ? adminGeneratedCodeDisplay.textContent : "";
        if (!code) return;
        navigator.clipboard.writeText(code).then(() => {
            const origText = adminCopyCodeBtn.textContent;
            adminCopyCodeBtn.textContent = "✓ ¡Copiado!";
            setTimeout(() => {
                adminCopyCodeBtn.textContent = origText;
            }, 1800);
        });
    });
}

// Admin - Search Filter
if (adminSearchVerifyPilotInput) {
    adminSearchVerifyPilotInput.addEventListener("input", () => {
        renderAdminVerifyTab(adminSearchVerifyPilotInput.value);
    });
}

/* =========================================================
   USER DRIVER CARD CUSTOMIZER (FIREBASE SYNC)
========================================================= */

const cardEditorModalOverlay = document.getElementById("cardEditorModalOverlay");
const closeCardEditorModalBtn = document.getElementById("closeCardEditorModal");
const openCardCustomizerPopupBtn = document.getElementById("openCardCustomizerPopupBtn");
const userCardEditForm = document.getElementById("userCardEditForm");
const editCardAvatar = document.getElementById("editCardAvatar");
const editCardColor = document.getElementById("editCardColor");
const editCardColorHex = document.getElementById("editCardColorHex");
const editCardFlagDisplay = document.getElementById("editCardFlagDisplay");
const editCardCountryName = document.getElementById("editCardCountryName");
const editCardBio = document.getElementById("editCardBio");
const editCardTwitch = document.getElementById("editCardTwitch");
const editCardYoutube = document.getElementById("editCardYoutube");
const editCardTwitter = document.getElementById("editCardTwitter");
const editCardDiscord = document.getElementById("editCardDiscord");
const editCardNotice = document.getElementById("editCardNotice");

function openCardEditorModal() {
    if (!cardEditorModalOverlay) return;
    if (activeUserData) populateUserCardEditor(activeUserData);
    cardEditorModalOverlay.classList.add("active");
    cardEditorModalOverlay.setAttribute("aria-hidden", "false");
    document.body.style.overflow = "hidden";
}

function closeCardEditorModal() {
    if (!cardEditorModalOverlay) return;
    cardEditorModalOverlay.classList.remove("active");
    cardEditorModalOverlay.setAttribute("aria-hidden", "true");
    document.body.style.overflow = "";
}

if (openCardCustomizerPopupBtn) {
    openCardCustomizerPopupBtn.addEventListener("click", (e) => {
        if (e) e.stopPropagation();
        closeAllDropdowns();
        openCardEditorModal();
    });
}

const profileLangEsBtn = document.getElementById("profileLangEsBtn");
const profileLangEnBtn = document.getElementById("profileLangEnBtn");

if (profileLangEsBtn) {
    profileLangEsBtn.addEventListener("click", (e) => {
        if (e) e.stopPropagation();
        setLanguage("es");
        if (profileLangEsBtn) profileLangEsBtn.classList.add("active");
        if (profileLangEnBtn) profileLangEnBtn.classList.remove("active");
    });
}
if (profileLangEnBtn) {
    profileLangEnBtn.addEventListener("click", (e) => {
        if (e) e.stopPropagation();
        setLanguage("en");
        if (profileLangEnBtn) profileLangEnBtn.classList.add("active");
        if (profileLangEsBtn) profileLangEsBtn.classList.remove("active");
    });
}

if (closeCardEditorModalBtn) closeCardEditorModalBtn.addEventListener("click", closeCardEditorModal);
if (cardEditorModalOverlay) {
    cardEditorModalOverlay.addEventListener("click", (e) => {
        if (e.target === cardEditorModalOverlay) closeCardEditorModal();
    });
}

if (editCardColor && editCardColorHex) {
    editCardColor.addEventListener("input", () => {
        editCardColorHex.textContent = editCardColor.value.toUpperCase();
    });
}

// Live Card Preview in Customizer Modal
function updateCardLivePreview() {
    const previewStrip = document.getElementById("previewCardStrip");
    const previewBox = document.getElementById("cardLivePreviewBox");
    const previewAvatarImg = document.getElementById("previewAvatarImg");
    const previewAvatarFallback = document.getElementById("previewAvatarFallback");
    const previewAvatarWrap = document.getElementById("previewAvatarWrap");
    const previewFlag = document.getElementById("previewFlag");
    const previewDriverName = document.getElementById("previewDriverName");
    const previewTeamPill = document.getElementById("previewTeamPill");
    const previewDorsal = document.getElementById("previewDorsal");
    const previewBioBox = document.getElementById("previewBioBox");
    const previewBioText = document.getElementById("previewBioText");
    const previewSocialBox = document.getElementById("previewSocialBox");
    const previewSocialGrid = document.getElementById("previewSocialGrid");

    const color = (editCardColor ? editCardColor.value : "#e10600") || "#e10600";
    const avatarUrl = editCardAvatar ? editCardAvatar.value.trim() : "";
    const driverName = (activeUserData && activeUserData.claimedDriver) ? activeUserData.claimedDriver : "Tu Piloto";
    const teamName = (activeUserData && activeUserData.claimedTeam) ? activeUserData.claimedTeam : "Piloto Oficial";
    const officialFlag = getOfficialDriverFlag(driverName);
    const bio = editCardBio ? editCardBio.value.trim() : "";

    // Color accents
    if (previewStrip) {
        previewStrip.style.background = color;
        previewStrip.style.boxShadow = `0 0 12px ${color}`;
    }
    if (previewBox) {
        previewBox.style.borderColor = `${color}90`;
        previewBox.style.boxShadow = `0 0 20px ${color}25`;
    }
    if (previewAvatarWrap) {
        previewAvatarWrap.style.borderColor = color;
    }
    if (previewDorsal) {
        previewDorsal.style.color = color;
        previewDorsal.style.borderColor = `${color}60`;
        previewDorsal.style.background = `${color}15`;
    }

    // Avatar
    if (previewAvatarImg && previewAvatarFallback) {
        if (avatarUrl) {
            previewAvatarImg.src = avatarUrl;
            previewAvatarImg.style.display = "block";
            previewAvatarFallback.style.display = "none";
            previewAvatarImg.onerror = () => {
                previewAvatarImg.style.display = "none";
                previewAvatarFallback.style.display = "block";
            };
        } else {
            previewAvatarImg.src = "";
            previewAvatarImg.style.display = "none";
            previewAvatarFallback.style.display = "block";
        }
    }

    // Name & Flag
    if (previewFlag) previewFlag.innerHTML = getFlagHtml(officialFlag || "🏁", 24);
    if (previewDriverName) previewDriverName.textContent = driverName;
    if (previewTeamPill) previewTeamPill.textContent = teamName;

    // Bio
    if (previewBioBox && previewBioText) {
        if (bio) {
            previewBioText.textContent = bio;
            previewBioBox.style.display = "block";
            previewBioBox.style.borderLeftColor = color;
        } else {
            previewBioBox.style.display = "none";
            previewBioText.textContent = "";
        }
    }

    // Socials
    if (previewSocialBox && previewSocialGrid) {
        previewSocialGrid.innerHTML = "";
        let socialCount = 0;

        const twitchVal = editCardTwitch ? editCardTwitch.value.trim() : "";
        const ytVal = editCardYoutube ? editCardYoutube.value.trim() : "";
        const twVal = editCardTwitter ? editCardTwitter.value.trim() : "";
        const dcVal = editCardDiscord ? editCardDiscord.value.trim() : "";

        if (twitchVal) {
            socialCount++;
            const pill = document.createElement("span");
            pill.className = "social-pill social-pill-twitch";
            pill.style.borderColor = `${color}60`;
            pill.textContent = `👾 ${twitchVal.replace("@", "")}`;
            previewSocialGrid.appendChild(pill);
        }
        if (ytVal) {
            socialCount++;
            const pill = document.createElement("span");
            pill.className = "social-pill social-pill-youtube";
            pill.style.borderColor = `${color}60`;
            pill.textContent = `📺 ${ytVal}`;
            previewSocialGrid.appendChild(pill);
        }
        if (twVal) {
            socialCount++;
            const pill = document.createElement("span");
            pill.className = "social-pill social-pill-twitter";
            pill.style.borderColor = `${color}60`;
            pill.textContent = `🐦 ${twVal.startsWith("@") ? twVal : "@" + twVal}`;
            previewSocialGrid.appendChild(pill);
        }
        if (dcVal) {
            socialCount++;
            const pill = document.createElement("span");
            pill.className = "social-pill social-pill-discord";
            pill.style.borderColor = `${color}60`;
            pill.textContent = `💬 ${dcVal}`;
            previewSocialGrid.appendChild(pill);
        }

        previewSocialBox.style.display = socialCount > 0 ? "block" : "none";
    }
}

function getPresetHelmetSvg(primaryColor) {
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100" width="100" height="100">
        <circle cx="50" cy="50" r="48" fill="#080c14" stroke="${primaryColor}" stroke-width="3"/>
        <path d="M22 56 C22 34 35 20 54 20 C73 20 84 33 84 54 C84 68 76 78 62 80 L36 80 C26 76 22 66 22 56 Z" fill="${primaryColor}"/>
        <path d="M38 34 C44 30 62 30 76 38 C79 40 80 44 80 49 L58 49 C46 49 38 43 38 34 Z" fill="#0b111e" stroke="#ffffff" stroke-width="1.2"/>
        <path d="M42 42 C52 38 68 40 76 44" stroke="#ffffff" stroke-width="1" stroke-linecap="round" opacity="0.6"/>
        <circle cx="48" cy="62" r="5" fill="#0b111e"/>
        <path d="M34 68 L68 68" stroke="#0b111e" stroke-width="3" stroke-linecap="round"/>
        <path d="M50 20 L50 28" stroke="#ffffff" stroke-width="2" stroke-linecap="round"/>
    </svg>`;
    return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
}

function syncActiveColorSwatch(color) {
    const swatches = document.querySelectorAll(".color-swatch-btn");
    swatches.forEach(sw => {
        const swColor = sw.getAttribute("data-color");
        if (swColor && swColor.toLowerCase() === (color || "").toLowerCase()) {
            sw.classList.add("active");
        } else {
            sw.classList.remove("active");
        }
    });
}

// Populate User Customizer Form
function populateUserCardEditor(data) {
    if (!data) return;
    if (editCardAvatar) editCardAvatar.value = data.avatarUrl || "";
    if (editCardColor) {
        const color = data.cardColor || "#e10600";
        editCardColor.value = color;
        if (editCardColorHex) editCardColorHex.textContent = color.toUpperCase();
        syncActiveColorSwatch(color);
    }
    const driverName = data.claimedDriver || (activeUserData && activeUserData.claimedDriver) || "";
    const officialFlag = getOfficialDriverFlag(driverName);
    const countryName = getCountryNameByFlag(officialFlag);
    if (editCardFlagDisplay) editCardFlagDisplay.innerHTML = getFlagHtml(officialFlag || "🏁", 24);
    if (editCardCountryName) editCardCountryName.innerHTML = `${getFlagHtml(officialFlag || "🏁", 18)} <span style="vertical-align: middle; margin-left: 4px;">${countryName}</span>`;

    const bioCharCounter = document.getElementById("bioCharCounter");
    if (editCardBio) {
        let bioVal = data.bio || "";
        if (!bioVal || bioVal.toLowerCase().includes("sexo")) {
            bioVal = "Official FFC driver competing in the 2010 Championship season.";
        }
        editCardBio.value = bioVal;
        if (bioCharCounter) bioCharCounter.textContent = `${bioVal.length}/300`;
    }
    if (editCardTwitch) editCardTwitch.value = data.socialTwitch || "";
    if (editCardYoutube) editCardYoutube.value = data.socialYoutube || "";
    if (editCardTwitter) editCardTwitter.value = data.socialTwitter || "";
    if (editCardDiscord) editCardDiscord.value = data.socialDiscord || "";

    updateCardLivePreview();
}

// Live update preview on inputs
[editCardAvatar, editCardColor, editCardBio, editCardTwitch, editCardYoutube, editCardTwitter, editCardDiscord].forEach(input => {
    if (input) {
        input.addEventListener("input", () => {
            if (input === editCardColor) {
                if (editCardColorHex) editCardColorHex.textContent = editCardColor.value.toUpperCase();
                syncActiveColorSwatch(editCardColor.value);
            }
            if (input === editCardBio) {
                const counter = document.getElementById("bioCharCounter");
                if (counter) counter.textContent = `${editCardBio.value.length}/300`;
            }
            updateCardLivePreview();
        });
    }
});

// Color Swatch Picker Clicks
const colorPresetGrid = document.getElementById("colorPresetGrid");
if (colorPresetGrid) {
    colorPresetGrid.addEventListener("click", (e) => {
        const btn = e.target.closest(".color-swatch-btn");
        if (!btn) return;
        const color = btn.getAttribute("data-color");
        if (color && editCardColor) {
            editCardColor.value = color;
            if (editCardColorHex) editCardColorHex.textContent = color.toUpperCase();
            syncActiveColorSwatch(color);
            updateCardLivePreview();
        }
    });
}

// Avatar Presets & Clear
const avatarQuickPresets = document.getElementById("avatarQuickPresets");
if (avatarQuickPresets) {
    avatarQuickPresets.addEventListener("click", (e) => {
        const btn = e.target.closest(".avatar-preset-btn");
        if (!btn) return;
        const preset = btn.getAttribute("data-avatar");
        if (preset === "helmet-gold") {
            if (editCardAvatar) editCardAvatar.value = getPresetHelmetSvg("#d6b45c");
        } else if (preset === "helmet-red") {
            if (editCardAvatar) editCardAvatar.value = getPresetHelmetSvg("#e10600");
        } else if (preset === "helmet-blue") {
            if (editCardAvatar) editCardAvatar.value = getPresetHelmetSvg("#0600ef");
        } else if (preset === "helmet-green") {
            if (editCardAvatar) editCardAvatar.value = getPresetHelmetSvg("#00594f");
        } else if (btn.id === "btnRemoveAvatar") {
            if (editCardAvatar) editCardAvatar.value = "";
        }
        updateCardLivePreview();
    });
}

// Avatar File Upload via offscreen Canvas
const editCardFileInput = document.getElementById("editCardFileInput");
const btnTriggerAvatarFile = document.getElementById("btnTriggerAvatarFile");
if (btnTriggerAvatarFile && editCardFileInput) {
    btnTriggerAvatarFile.addEventListener("click", () => editCardFileInput.click());

    editCardFileInput.addEventListener("change", (e) => {
        const file = e.target.files && e.target.files[0];
        if (!file) return;

        if (!file.type.startsWith("image/")) {
            return;
        }

        const reader = new FileReader();
        reader.onload = (event) => {
            const img = new Image();
            img.onload = () => {
                const canvas = document.createElement("canvas");
                const MAX_SIZE = 180;
                let width = img.width;
                let height = img.height;

                if (width > height) {
                    if (width > MAX_SIZE) {
                        height = Math.round((height * MAX_SIZE) / width);
                        width = MAX_SIZE;
                    }
                } else {
                    if (height > MAX_SIZE) {
                        width = Math.round((width * MAX_SIZE) / height);
                        height = MAX_SIZE;
                    }
                }

                canvas.width = width;
                canvas.height = height;
                const ctx = canvas.getContext("2d");
                ctx.drawImage(img, 0, 0, width, height);

                const dataUrl = canvas.toDataURL("image/jpeg", 0.85);
                if (editCardAvatar) {
                    editCardAvatar.value = dataUrl;
                    updateCardLivePreview();
                }
            };
            img.src = event.target.result;
        };
        reader.readAsDataURL(file);
    });
}

// Bio Suggestions
const bioSuggestionsRow = document.querySelector(".bio-suggestions-row");
if (bioSuggestionsRow) {
    bioSuggestionsRow.addEventListener("click", (e) => {
        const btn = e.target.closest(".bio-tag-btn");
        if (!btn) return;
        const tag = btn.getAttribute("data-tag");
        if (!tag || !editCardBio) return;

        const current = editCardBio.value.trim();
        if (!current) {
            editCardBio.value = tag;
        } else if (!current.includes(tag)) {
            if (current.length + tag.length + 3 <= 300) {
                editCardBio.value = `${current} | ${tag}`;
            }
        }
        const counter = document.getElementById("bioCharCounter");
        if (counter) counter.textContent = `${editCardBio.value.length}/300`;
        updateCardLivePreview();
    });
}

// Modal View Official Card Button
const modalViewOfficialCardBtn = document.getElementById("modalViewOfficialCardBtn");
if (modalViewOfficialCardBtn) {
    modalViewOfficialCardBtn.addEventListener("click", () => {
        closeCardEditorModal();
        const driverName = (activeUserData && activeUserData.claimedDriver) ? activeUserData.claimedDriver : (currentPilotos && currentPilotos[0] ? currentPilotos[0].driver : "Dieguiosk");
        openDriverStatsModal(driverName);
    });
}

// View My Driver Card Button in Profile dropdown
const openMyDriverCardBtn = document.getElementById("openMyDriverCardBtn");
if (openMyDriverCardBtn) {
    openMyDriverCardBtn.addEventListener("click", (e) => {
        if (e) e.stopPropagation();
        closeAllDropdowns();
        const driverName = (activeUserData && activeUserData.claimedDriver) ? activeUserData.claimedDriver : (currentPilotos && currentPilotos[0] ? currentPilotos[0].driver : "Dieguiosk");
        openDriverStatsModal(driverName);
    });
}

// Save Custom Card Data to Firebase
if (userCardEditForm) {
    userCardEditForm.addEventListener("submit", async (e) => {
        e.preventDefault();
        if (!activeUserAuth || !activeUserData || !activeUserData.isVerified) {
            if (editCardNotice) {
                editCardNotice.textContent = "Debes tener tu perfil de piloto verificado para personalizar tu tarjeta.";
                editCardNotice.style.color = "#f85149";
            }
            return;
        }

        const pilotName = activeUserData.claimedDriver;
        const pilotDocId = activeUserData.claimedDriverId || (pilotName ? getPilotDocId(pilotName) : null);

        if (!pilotDocId) {
            if (editCardNotice) {
                editCardNotice.textContent = "Error: No se encontró la ID de tu piloto en la base de datos.";
                editCardNotice.style.color = "#f85149";
            }
            return;
        }

        const customPayload = {
            avatarUrl: editCardAvatar ? editCardAvatar.value.trim() : null,
            cardColor: editCardColor ? editCardColor.value : "#e10600",
            bio: editCardBio ? editCardBio.value.trim() : null,
            socialTwitch: editCardTwitch ? editCardTwitch.value.trim() : null,
            socialYoutube: editCardYoutube ? editCardYoutube.value.trim() : null,
            socialTwitter: editCardTwitter ? editCardTwitter.value.trim() : null,
            socialDiscord: editCardDiscord ? editCardDiscord.value.trim() : null,
            updatedAt: new Date().toISOString()
        };

        if (editCardNotice) {
            editCardNotice.textContent = "Guardando en Firebase...";
            editCardNotice.style.color = "#8b949e";
        }

        try {
            const batch = writeBatch(db);

            // 1. Update document in 'pilotos' collection
            batch.set(doc(db, "pilotos", pilotDocId), customPayload, { merge: true });

            // 2. Update document in 'usuarios' collection by UID
            batch.set(doc(db, "usuarios", activeUserAuth.uid), customPayload, { merge: true });

            // 3. Update document in 'usuarios' collection by Email Doc ID
            if (activeUserAuth.email) {
                batch.set(doc(db, "usuarios", getUserDocId(activeUserAuth.email)), customPayload, { merge: true });
            }

            await batch.commit();

            // Update in-memory pilot data in currentPilotos
            const targetP = (currentPilotos || []).find(p => (p.id || getPilotDocId(p.driver)) === pilotDocId || normalizeDriverKey(p.driver) === normalizeDriverKey(pilotName));
            if (targetP) {
                Object.assign(targetP, customPayload);
            }

            activeUserData = {
                ...activeUserData,
                ...customPayload
            };

            updateCardLivePreview();

            // Refresh matrix & standings
            renderStandingsOnPage(currentPilotos);
            renderFfcMatrixTable();

            // Refresh open driver stats modal if viewing own card
            if (currentOpenModalDriver && normalizeDriverKey(currentOpenModalDriver) === normalizeDriverKey(pilotName)) {
                openDriverStatsModal(pilotName);
            }

            if (editCardNotice) {
                editCardNotice.innerHTML = `✓ ¡Tarjeta de piloto actualizada en Firebase! <button type="button" id="noticeOpenCardBtn" style="background: none; border: none; color: #fce79a; font-weight: bold; text-decoration: underline; cursor: pointer; margin-left: 6px;">👁️ Ver Mi Tarjeta Oficial &rarr;</button>`;
                editCardNotice.style.color = "#10b981";
                const noticeBtn = document.getElementById("noticeOpenCardBtn");
                if (noticeBtn) {
                    noticeBtn.addEventListener("click", () => {
                        closeCardEditorModal();
                        openDriverStatsModal(pilotName);
                    });
                }
            }

        } catch (err) {
            console.error("Error al guardar tarjeta de piloto:", err);
            if (editCardNotice) {
                editCardNotice.textContent = "Error al guardar en Firebase.";
                editCardNotice.style.color = "#f85149";
            }
        }
    });
}

/* =========================================================
   FFC FANTASY LEAGUE SYSTEM (OPCIÓN 2: EQUIPO & PRESUPUESTO)
   75.0M€ de presupuesto · 3 Pilotos + 1 Constructor · Turbo Driver x2
========================================================= */

// Fantasy state & constants are initialized globally at top of script for lifecycle stability
if (!window.ffcFantasyState) {
    window.ffcFantasyState = ffcFantasyState;
}

// Fantasy Auth & Session Helpers
function getFantasyCurrentUser() {
    try {
        if (typeof activeUserAuth !== "undefined" && activeUserAuth && activeUserAuth.email) {
            return activeUserAuth;
        }
    } catch (e) {}
    try {
        if (typeof LocalAuthStore !== "undefined") {
            const u = LocalAuthStore.getCurrentUser();
            if (u && u.email) return u;
        }
    } catch (e) {}
    return null;
}

function isFantasyUserLoggedIn() {
    return Boolean(getFantasyCurrentUser());
}

function requireFantasyAuth() {
    if (!isFantasyUserLoggedIn()) {
        if (typeof openUserAuthModal === "function") {
            openUserAuthModal("login");
        } else {
            alert("Debes iniciar sesión con tu cuenta para jugar a la FFC Fantasy.");
        }
        return false;
    }
    return true;
}

// Helper: Get Official Driver Data from live standings or dataset
function getFantasyDriverData(driverName) {
    if (!driverName) return null;
    const clean = driverName.trim().toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
    
    // 1. Search in currentStandingsData (has latest live points)
    if (typeof currentStandingsData !== "undefined" && Array.isArray(currentStandingsData)) {
        const found = currentStandingsData.find(d => 
            d && d.driver && d.driver.trim().toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "") === clean
        );
        if (found) return found;
    }
    
    // 2. Search in ffc2010SeasonDrivers
    if (typeof ffc2010SeasonDrivers !== "undefined" && Array.isArray(ffc2010SeasonDrivers)) {
        const found = ffc2010SeasonDrivers.find(d => 
            d && d.driver && d.driver.trim().toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "") === clean
        );
        if (found) return found;
    }
    
    // 3. Fallback defaultDriverRoster
    if (typeof defaultDriverRoster !== "undefined" && Array.isArray(defaultDriverRoster)) {
        const found = defaultDriverRoster.find(d => 
            d && d.driver && d.driver.trim().toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "") === clean
        );
        if (found) return { driver: found.driver, team: found.team, pts: 0 };
    }

    return { driver: driverName, team: "FFC", pts: 0 };
}

// Find the most recent officially completed Grand Prix
function getLatestCompletedRace() {
    const list = (typeof FFC_SEASON_GPS !== "undefined" && Array.isArray(FFC_SEASON_GPS)) ? FFC_SEASON_GPS : [];
    let latestRace = null;
    let latestMeta = null;
    let latestKey = null;

    const rMap = (typeof raceResults !== "undefined" && raceResults) ? raceResults : {};

    for (let i = list.length - 1; i >= 0; i--) {
        const gp = list[i];
        const r = rMap[gp.raceKey];
        if (r && (r.status === "COMPLETED" || (r.winner && r.winner !== "TBA" && Array.isArray(r.drivers) && r.drivers.length > 0))) {
            latestRace = r;
            latestMeta = gp;
            latestKey = gp.raceKey;
            break;
        }
    }

    if (!latestRace) {
        for (let i = list.length - 1; i >= 0; i--) {
            const gp = list[i];
            const r = rMap[gp.raceKey];
            if (r && Array.isArray(r.drivers) && r.drivers.length > 0) {
                latestRace = r;
                latestMeta = gp;
                latestKey = gp.raceKey;
                break;
            }
        }
    }

    return {
        raceKey: latestKey,
        race: latestRace,
        meta: latestMeta
    };
}

// Calculate dynamic price fluctuation for a Driver
function getDriverPriceFluctuation(driverName) {
    const d = getFantasyDriverData(driverName);
    const pts = d ? (Number(d.pts) || 0) : 0;
    const basePrice = Math.round((6.0 + (pts * 0.155)) * 10) / 10;

    const latest = getLatestCompletedRace();
    let delta = 0.0;
    let lastRacePts = 0;
    let lastRacePos = null;
    let lastRaceName = latest.meta ? (latest.meta.name || latest.meta.code) : "Último GP";

    if (latest.race && Array.isArray(latest.race.drivers) && latest.race.drivers.length > 0) {
        const norm = normalizeDriverKey(driverName);
        let foundEntry = null;

        latest.race.drivers.forEach((entry, idx) => {
            if (!entry || !entry.driver) return;
            if (normalizeDriverKey(entry.driver) === norm) {
                foundEntry = entry;
                if (entry.status !== "DSQ" && entry.status !== "DNS" && entry.status !== "NC" && entry.status !== "AUSENTE" && entry.status !== "NO_SHOW") {
                    const pos = Number(entry.pos) || (idx + 1);
                    lastRacePos = `${pos}º`;
                    if (pos >= 1 && pos <= 10) {
                        lastRacePts += (F1_POINTS_MAP[pos] || 0);
                    }
                } else if (entry.status === "DSQ") {
                    lastRacePos = "DSQ";
                } else {
                    lastRacePos = "DNS";
                }
            }
        });

        if (latest.race.fastest && latest.race.fastest !== "TBA") {
            const rawName = latest.race.fastest.split("·")[0].trim();
            if (rawName && normalizeDriverKey(rawName) === norm) {
                lastRacePts += (typeof F1_FASTEST_LAP_PTS !== "undefined" ? F1_FASTEST_LAP_PTS : 1);
            }
        }

        const didNotParticipate = !foundEntry || (foundEntry.status === "DNS" || foundEntry.status === "NC" || foundEntry.status === "AUSENTE" || foundEntry.status === "NO_SHOW");

        if (didNotParticipate) {
            // If the driver did not participate in this GP, do NOT discount their price (delta = 0)
            delta = 0.0;
        } else if (foundEntry.status === "DSQ") {
            delta = -0.6;
        } else if (foundEntry.status === "DNF") {
            delta = basePrice > 16 ? -0.4 : -0.2;
        } else if (lastRacePts >= 25) {
            delta = +0.8;
        } else if (lastRacePts >= 18) {
            delta = +0.6;
        } else if (lastRacePts >= 15) {
            delta = +0.5;
        } else if (lastRacePts >= 10) {
            delta = basePrice < 15 ? +0.5 : +0.3;
        } else if (lastRacePts >= 6) {
            delta = basePrice < 12 ? +0.4 : +0.2;
        } else if (lastRacePts >= 1) {
            delta = basePrice < 10 ? +0.3 : +0.1;
        } else {
            delta = basePrice > 18 ? -0.5 : (basePrice > 12 ? -0.3 : -0.1);
        }
    } else {
        delta = 0.0;
    }

    const settings = getSavedSettings();
    const isEnabled = settings ? (settings.fantasyFluctuationEnabled !== false) : true;
    const volatility = settings && typeof settings.fantasyVolatilityMultiplier === "number" ? settings.fantasyVolatilityMultiplier : 1.0;

    if (!isEnabled) {
        delta = 0.0;
    } else {
        delta = Math.round((delta * volatility) * 10) / 10;
    }

    let dynamicPrice = Math.max(5.0, Math.min(32.0, Math.round((basePrice + delta) * 10) / 10));

    let trend = "flat";
    let formClass = "trend-flat";
    let formTag = "➖ Estable";

    const isNonParticipant = latest.race && Array.isArray(latest.race.drivers) && latest.race.drivers.length > 0 && (!latest.race.drivers.some(e => e && e.driver && normalizeDriverKey(e.driver) === normalizeDriverKey(driverName)) || (latest.race.drivers.find(e => e && e.driver && normalizeDriverKey(e.driver) === normalizeDriverKey(driverName))?.status === "DNS"));

    if (isNonParticipant) {
        trend = "flat";
        formClass = "trend-flat";
        formTag = `⏸️ No participó (en ${lastRaceName})`;
    } else if (delta > 0) {
        trend = "up";
        formClass = "trend-up";
        if (delta >= 0.5) formTag = `🔥 En Racha (+${lastRacePts} pts en ${lastRaceName})`;
        else formTag = `📈 Al Alza (+${lastRacePts} pts en ${lastRaceName})`;
    } else if (delta < 0) {
        trend = "down";
        formClass = "trend-down";
        if (delta <= -0.4) formTag = `❄️ En Frío (${lastRacePos || '0 pts'} en ${lastRaceName})`;
        else formTag = `📉 Descuento (${lastRacePos || '0 pts'} en ${lastRaceName})`;
    } else {
        formTag = lastRacePts > 0 ? `⚡ Rentable (${lastRacePts} pts)` : `➖ Valor Estable`;
    }

    return {
        basePrice,
        currentPrice: dynamicPrice,
        delta,
        deltaFormatted: (delta > 0 ? `+${delta.toFixed(1)}` : delta.toFixed(1)) + "M€",
        trend,
        lastRacePts,
        lastRacePos,
        lastRaceName,
        formTag,
        formClass
    };
}

// Calculate dynamic price fluctuation for a Constructor
function getTeamPriceFluctuation(teamName) {
    if (!teamName) {
        return {
            basePrice: 16.0,
            currentPrice: 16.0,
            delta: 0,
            deltaFormatted: "+0.0M€",
            trend: "flat",
            lastRacePts: 0,
            lastRaceName: "Temporada",
            formTag: "➖ Estable",
            formClass: "trend-flat"
        };
    }

    const pts = getTeamCurrentPoints(teamName);
    const basePrice = Math.round((14.0 + (pts * 0.115)) * 10) / 10;

    const latest = getLatestCompletedRace();
    let delta = 0.0;
    let lastRacePts = 0;
    let lastRaceName = latest.meta ? (latest.meta.name || latest.meta.code) : "Último GP";
    let teamDriversCount = 0;

    if (latest.race && Array.isArray(latest.race.drivers) && latest.race.drivers.length > 0) {
        const cleanTeam = teamName.trim().toLowerCase();

        latest.race.drivers.forEach((entry, idx) => {
            if (!entry || !entry.driver) return;
            const dTeam = (entry.team || getDriverTeam(entry.driver) || "").trim().toLowerCase();
            if (dTeam === cleanTeam) {
                if (entry.status !== "DNS" && entry.status !== "NC" && entry.status !== "AUSENTE" && entry.status !== "NO_SHOW") {
                    teamDriversCount++;
                }
                if (entry.status !== "DSQ" && entry.status !== "DNS" && entry.status !== "NC" && entry.status !== "AUSENTE" && entry.status !== "NO_SHOW") {
                    const pos = Number(entry.pos) || (idx + 1);
                    if (pos >= 1 && pos <= 10) {
                        lastRacePts += (F1_POINTS_MAP[pos] || 0);
                    }
                }
            }
        });

        if (latest.race.fastest && latest.race.fastest !== "TBA") {
            const rawName = latest.race.fastest.split("·")[0].trim();
            if (rawName) {
                const flDriverTeam = (getDriverTeam(rawName) || "").trim().toLowerCase();
                if (flDriverTeam === cleanTeam) {
                    lastRacePts += (typeof F1_FASTEST_LAP_PTS !== "undefined" ? F1_FASTEST_LAP_PTS : 1);
                }
            }
        }

        if (teamDriversCount === 0) {
            // Escudería no participó en este GP -> no se descuenta
            delta = 0.0;
        } else if (lastRacePts >= 37) delta = +1.0;
        else if (lastRacePts >= 27) delta = +0.7;
        else if (lastRacePts >= 18) delta = +0.4;
        else if (lastRacePts >= 10) delta = +0.2;
        else if (lastRacePts >= 1) delta = basePrice > 25 ? -0.2 : +0.1;
        else delta = basePrice > 20 ? -0.6 : -0.3;
    } else {
        delta = 0.0;
    }

    const settings = getSavedSettings();
    const isEnabled = settings ? (settings.fantasyFluctuationEnabled !== false) : true;
    const volatility = settings && typeof settings.fantasyVolatilityMultiplier === "number" ? settings.fantasyVolatilityMultiplier : 1.0;

    if (!isEnabled) {
        delta = 0.0;
    } else {
        delta = Math.round((delta * volatility) * 10) / 10;
    }

    let dynamicPrice = Math.max(12.0, Math.min(42.0, Math.round((basePrice + delta) * 10) / 10));

    let trend = "flat";
    let formClass = "trend-flat";
    let formTag = "➖ Estable";

    if (teamDriversCount === 0 && latest.race && Array.isArray(latest.race.drivers) && latest.race.drivers.length > 0) {
        trend = "flat";
        formClass = "trend-flat";
        formTag = `⏸️ Sin Participación (en ${lastRaceName})`;
    } else if (delta > 0) {
        trend = "up";
        formClass = "trend-up";
        if (delta >= 0.6) formTag = `🔥 En Racha (+${lastRacePts} pts en ${lastRaceName})`;
        else formTag = `📈 Al Alza (+${lastRacePts} pts en ${lastRaceName})`;
    } else if (delta < 0) {
        trend = "down";
        formClass = "trend-down";
        if (delta <= -0.4) formTag = `❄️ En Frío (${lastRacePts} pts en ${lastRaceName})`;
        else formTag = `📉 Descuento (${lastRacePts} pts en ${lastRaceName})`;
    } else {
        formTag = lastRacePts > 0 ? `⚡ Rentable (${lastRacePts} pts)` : `➖ Valor Estable`;
    }

    return {
        basePrice,
        currentPrice: dynamicPrice,
        delta,
        deltaFormatted: (delta > 0 ? `+${delta.toFixed(1)}` : delta.toFixed(1)) + "M€",
        trend,
        lastRacePts,
        lastRaceName,
        formTag,
        formClass
    };
}

// Calculate Balanced Dynamic Driver Fantasy Price
function getDriverFantasyPrice(driverName) {
    const flu = getDriverPriceFluctuation(driverName);
    return flu.currentPrice;
}

// Calculate Balanced Dynamic Constructor Fantasy Price
function getConstructorFantasyPrice(teamName) {
    const flu = getTeamPriceFluctuation(teamName);
    return flu.currentPrice;
}

// Render Admin Market Sentiment and Trends Widget
function renderAdminMarketSentimentWidget() {
    const widget = document.getElementById("adminMarketSentimentWidget");
    if (!widget) return;

    const allDrivers = (typeof ffc2010SeasonDrivers !== "undefined" && Array.isArray(ffc2010SeasonDrivers))
        ? ffc2010SeasonDrivers
        : (typeof defaultStandings !== "undefined" ? defaultStandings : []);

    const allTeams = typeof F1_TEAMS !== "undefined" ? F1_TEAMS : ["Red Bull", "Ferrari", "McLaren", "Mercedes", "Renault", "Williams", "Force India", "Sauber", "Toro Rosso", "Lotus", "HRT", "Virgin"];

    let maxUpDriver = null;
    let maxDownDriver = null;
    let maxUpTeam = null;

    allDrivers.forEach(d => {
        if (!d || !d.driver) return;
        const flu = getDriverPriceFluctuation(d.driver);
        if (!maxUpDriver || flu.delta > maxUpDriver.flu.delta) {
            maxUpDriver = { name: d.driver, team: d.team, flu };
        }
        if (!maxDownDriver || flu.delta < maxDownDriver.flu.delta) {
            maxDownDriver = { name: d.driver, team: d.team, flu };
        }
    });

    allTeams.forEach(t => {
        if (!t) return;
        const flu = getTeamPriceFluctuation(t);
        if (!maxUpTeam || flu.delta > maxUpTeam.flu.delta) {
            maxUpTeam = { name: t, flu };
        }
    });

    const latest = getLatestCompletedRace();
    const gpName = latest.meta ? `${latest.meta.flag || '🏁'} ${latest.meta.name || latest.meta.code}` : "Temporada Regular";

    const s = getSavedSettings();
    const isFluct = s ? (s.fantasyFluctuationEnabled !== false) : true;
    const vol = s && typeof s.fantasyVolatilityMultiplier === "number" ? s.fantasyVolatilityMultiplier : 1.0;

    widget.innerHTML = `
        <div style="font-size:12px; color:#8b949e; margin-bottom:10px; display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:6px;">
            <span>Evaluación según: <strong style="color:#e6edf3;">${gpName}</strong> (Volatilidad: ${vol.toFixed(1)}x)</span>
            <span class="price-delta-badge ${isFluct ? 'trend-up' : 'trend-flat'}">${isFluct ? 'Fluctuación Activa' : 'Precios Estáticos'}</span>
        </div>
        <div style="display:grid; grid-template-columns: repeat(auto-fit, minmax(150px, 1fr)); gap:10px;">
            <div style="background: rgba(63, 185, 80, 0.08); border: 1px solid rgba(63, 185, 80, 0.25); border-radius: 8px; padding: 10px;">
                <div style="font-size: 10px; text-transform: uppercase; color: #3fb950; font-weight: 700; margin-bottom: 4px;">🚀 Mayor Subida</div>
                <div style="font-weight: 700; font-size: 13px; color: #f0f6fc; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">${maxUpDriver ? escapeHtml(maxUpDriver.name) : '--'}</div>
                <div style="font-size: 11px; color: #3fb950; font-weight: 700; margin-top: 2px;">${maxUpDriver ? maxUpDriver.flu.deltaFormatted : '+0.0M€'} (${maxUpDriver ? maxUpDriver.flu.currentPrice.toFixed(1) : 0}M€)</div>
            </div>
            <div style="background: rgba(248, 81, 73, 0.08); border: 1px solid rgba(248, 81, 73, 0.25); border-radius: 8px; padding: 10px;">
                <div style="font-size: 10px; text-transform: uppercase; color: #f85149; font-weight: 700; margin-bottom: 4px;">📉 Mayor Descuento</div>
                <div style="font-weight: 700; font-size: 13px; color: #f0f6fc; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">${maxDownDriver ? escapeHtml(maxDownDriver.name) : '--'}</div>
                <div style="font-size: 11px; color: #f85149; font-weight: 700; margin-top: 2px;">${maxDownDriver ? maxDownDriver.flu.deltaFormatted : '+0.0M€'} (${maxDownDriver ? maxDownDriver.flu.currentPrice.toFixed(1) : 0}M€)</div>
            </div>
            <div style="background: rgba(210, 153, 34, 0.08); border: 1px solid rgba(210, 153, 34, 0.25); border-radius: 8px; padding: 10px;">
                <div style="font-size: 10px; text-transform: uppercase; color: #d29922; font-weight: 700; margin-bottom: 4px;">🏎️ Escudería Destacada</div>
                <div style="font-weight: 700; font-size: 13px; color: #f0f6fc; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">${maxUpTeam ? escapeHtml(maxUpTeam.name) : '--'}</div>
                <div style="font-size: 11px; color: #d29922; font-weight: 700; margin-top: 2px;">${maxUpTeam ? maxUpTeam.flu.deltaFormatted : '+0.0M€'} (${maxUpTeam ? maxUpTeam.flu.currentPrice.toFixed(1) : 0}M€)</div>
            </div>
        </div>
    `;
}
window.renderAdminMarketSentimentWidget = renderAdminMarketSentimentWidget;

// Get team's current official accumulated points
function getTeamCurrentPoints(teamName) {
    if (!teamName) return 0;
    const cleanTeam = teamName.trim().toLowerCase();
    let total = 0;
    
    const roster = (typeof currentStandingsData !== "undefined" && Array.isArray(currentStandingsData) && currentStandingsData.length > 0)
        ? currentStandingsData
        : (typeof ffc2010SeasonDrivers !== "undefined" ? ffc2010SeasonDrivers : []);

    const seen = new Set();
    roster.forEach(d => {
        if (!d || !d.driver || !d.team) return;
        const norm = d.driver.trim().toLowerCase();
        if (seen.has(norm)) return;
        seen.add(norm);

        if (d.team.trim().toLowerCase() === cleanTeam) {
            total += Number(d.pts) || 0;
        }
    });

    return total;
}

// Check if a race counts towards Fantasy scoring (starts at Round 10: Nürburgring GP onwards)
function isFantasyScoringRace(raceKey, race) {
    if (!race) return false;
    const isCompleted = race.status === "COMPLETED" || (race.winner && race.winner !== "TBA");
    if (!isCompleted) return false;

    const roundNum = parseInt((race.round || "").replace(/\D/g, ""), 10);
    if (!isNaN(roundNum) && roundNum >= 10) return true;

    const postNurburgringKeys = ["nurburgring", "hungary", "belgium", "singapore", "cota", "brazil"];
    if (postNurburgringKeys.includes(String(raceKey).toLowerCase())) return true;

    return false;
}

// Get base points for a driver in a single race
function getDriverPointsInRace(driverName, race) {
    if (!driverName || !race || !Array.isArray(race.drivers)) return 0;
    const norm = normalizeDriverKey(driverName);
    let pts = 0;

    race.drivers.forEach((d, idx) => {
        if (!d || !d.driver) return;
        if (normalizeDriverKey(d.driver) === norm) {
            if (d.status !== "DSQ") {
                const pos = Number(d.pos) || (idx + 1);
                if (pos >= 1 && pos <= 10) {
                    pts += (F1_POINTS_MAP[pos] || 0);
                }
            }
        }
    });

    // Fastest lap bonus (+1 pt)
    if (race.fastest && race.fastest !== "TBA") {
        const rawName = race.fastest.split("·")[0].trim();
        if (rawName && normalizeDriverKey(rawName) === norm) {
            pts += (typeof F1_FASTEST_LAP_PTS !== "undefined" ? F1_FASTEST_LAP_PTS : 1);
        }
    }

    return pts;
}

// Get base points for a constructor in a single race
function getConstructorPointsInRace(teamName, race) {
    if (!teamName || !race || !Array.isArray(race.drivers)) return 0;
    const cleanTeam = teamName.trim().toLowerCase();
    let pts = 0;

    race.drivers.forEach((d, idx) => {
        if (!d || !d.driver) return;
        const dTeam = (d.team || getDriverTeam(d.driver) || "").trim().toLowerCase();
        if (dTeam === cleanTeam) {
            if (d.status !== "DSQ") {
                const pos = Number(d.pos) || (idx + 1);
                if (pos >= 1 && pos <= 10) {
                    pts += (F1_POINTS_MAP[pos] || 0);
                }
            }
        }
    });

    if (race.fastest && race.fastest !== "TBA") {
        const rawName = race.fastest.split("·")[0].trim();
        if (rawName) {
            const flDriverTeam = (getDriverTeam(rawName) || "").trim().toLowerCase();
            if (flDriverTeam === cleanTeam) {
                pts += (typeof F1_FASTEST_LAP_PTS !== "undefined" ? F1_FASTEST_LAP_PTS : 1);
            }
        }
    }

    return pts;
}

// Get list of all completed scoring races
function getCompletedScoringRaces() {
    const rMap = (typeof raceResults !== "undefined" && raceResults) ? raceResults : {};
    const list = [];
    Object.entries(rMap).forEach(([rKey, race]) => {
        if (isFantasyScoringRace(rKey, race)) {
            list.push({ key: rKey, race: race });
        }
    });
    return list;
}

// Calculate score earned by a specific lineup in a specific race
function getLineupScoreInRace(lineup, race) {
    if (!lineup || !race) return 0;
    let score = 0;

    if (lineup.driver1) {
        let p = getDriverPointsInRace(lineup.driver1, race);
        if (lineup.turboDriver === lineup.driver1) p *= 2;
        score += p;
    }
    if (lineup.driver2) {
        let p = getDriverPointsInRace(lineup.driver2, race);
        if (lineup.turboDriver === lineup.driver2) p *= 2;
        score += p;
    }
    if (lineup.driver3) {
        let p = getDriverPointsInRace(lineup.driver3, race);
        if (lineup.turboDriver === lineup.driver3) p *= 2;
        score += p;
    }
    if (lineup.team) {
        score += getConstructorPointsInRace(lineup.team, race);
    }

    return score;
}

// Calculate frozen round-by-round fantasy points for a team
function calculateFantasyTeamPoints(teamState) {
    if (!teamState) return { totalPts: 0, roundScores: {} };

    const completedRaces = getCompletedScoringRaces();
    let totalPts = 0;
    const roundScores = {};

    if (!teamState.roundLineups) {
        teamState.roundLineups = {};
    }

    completedRaces.forEach(({ key, race }) => {
        let lineup = teamState.roundLineups[key];

        if (!lineup) {
            const hasAnyOtherRoundLineup = Object.keys(teamState.roundLineups).length > 0;
            if (!hasAnyOtherRoundLineup) {
                lineup = {
                    driver1: teamState.driver1,
                    driver2: teamState.driver2,
                    driver3: teamState.driver3,
                    team: teamState.team,
                    turboDriver: teamState.turboDriver
                };
                teamState.roundLineups[key] = { ...lineup };
            }
        }

        if (lineup) {
            const rPts = getLineupScoreInRace(lineup, race);
            roundScores[key] = rPts;
            totalPts += rPts;
        } else {
            roundScores[key] = 0;
        }
    });

    return { totalPts, roundScores };
}

// Get accumulated fantasy points for a driver (from Round 10 onwards)
function getDriverFantasyPoints(driverName) {
    if (!driverName) return 0;
    const norm = normalizeDriverKey(driverName);
    let pts = 0;

    const rMap = (typeof raceResults !== "undefined" && raceResults) ? raceResults : {};
    Object.entries(rMap).forEach(([rKey, race]) => {
        if (!isFantasyScoringRace(rKey, race)) return;
        pts += getDriverPointsInRace(norm, race);
    });

    return pts;
}

// Get accumulated fantasy points for a constructor (from Round 10 onwards)
function getTeamFantasyPoints(teamName) {
    if (!teamName) return 0;
    let pts = 0;

    const rMap = (typeof raceResults !== "undefined" && raceResults) ? raceResults : {};
    Object.entries(rMap).forEach(([rKey, race]) => {
        if (!isFantasyScoringRace(rKey, race)) return;
        pts += getConstructorPointsInRace(teamName, race);
    });

    return pts;
}

// Calculate team budget, value, fluctuation equity and points
function calculateFantasyMetrics(teamState = ffcFantasyState) {
    let spent = 0;
    let filledSlots = 0;
    let teamDelta = 0;

    // Driver 1
    let d1Pts = 0;
    if (teamState.driver1) {
        spent += getDriverFantasyPrice(teamState.driver1);
        teamDelta += getDriverPriceFluctuation(teamState.driver1).delta;
        d1Pts = getDriverFantasyPoints(teamState.driver1);
        if (teamState.turboDriver === teamState.driver1) {
            d1Pts *= 2;
        }
        filledSlots++;
    }

    // Driver 2
    let d2Pts = 0;
    if (teamState.driver2) {
        spent += getDriverFantasyPrice(teamState.driver2);
        teamDelta += getDriverPriceFluctuation(teamState.driver2).delta;
        d2Pts = getDriverFantasyPoints(teamState.driver2);
        if (teamState.turboDriver === teamState.driver2) {
            d2Pts *= 2;
        }
        filledSlots++;
    }

    // Driver 3
    let d3Pts = 0;
    if (teamState.driver3) {
        spent += getDriverFantasyPrice(teamState.driver3);
        teamDelta += getDriverPriceFluctuation(teamState.driver3).delta;
        d3Pts = getDriverFantasyPoints(teamState.driver3);
        if (teamState.turboDriver === teamState.driver3) {
            d3Pts *= 2;
        }
        filledSlots++;
    }

    // Constructor
    let teamPts = 0;
    if (teamState.team) {
        spent += getConstructorFantasyPrice(teamState.team);
        teamDelta += getTeamPriceFluctuation(teamState.team).delta;
        teamPts = getTeamFantasyPoints(teamState.team);
        filledSlots++;
    }

    spent = Math.round(spent * 10) / 10;
    teamDelta = Math.round(teamDelta * 10) / 10;
    const remaining = Math.round((FANTASY_INITIAL_BUDGET - spent) * 10) / 10;

    const { totalPts, roundScores } = calculateFantasyTeamPoints(teamState);

    return {
        spent,
        remaining,
        totalPts,
        roundScores,
        filledSlots,
        teamDelta,
        d1Pts,
        d2Pts,
        d3Pts,
        teamPts
    };
}

// Local and Cloud Persistence
function loadFantasyTeamFromStorage() {
    try {
        const user = getFantasyCurrentUser();
        const userKey = user && user.email 
            ? ("ffc_fantasy_team_" + user.email.toLowerCase().trim().replace(/[^a-z0-9_]/g, "_")) 
            : FANTASY_LOCAL_STORAGE_KEY;
        const raw = localStorage.getItem(userKey) || localStorage.getItem(FANTASY_LOCAL_STORAGE_KEY);
        if (raw) {
            const parsed = JSON.parse(raw);
            if (parsed && typeof parsed === "object") {
                ffcFantasyState.teamName = parsed.teamName || (user ? `Escudería de ${user.displayName || user.email.split('@')[0]}` : "Mi Escudería FFC");
                ffcFantasyState.driver1 = parsed.driver1 || null;
                ffcFantasyState.driver2 = parsed.driver2 || null;
                ffcFantasyState.driver3 = parsed.driver3 || null;
                ffcFantasyState.team = parsed.team || null;
                ffcFantasyState.turboDriver = parsed.turboDriver || null;
                ffcFantasyState.roundLineups = parsed.roundLineups || {};
            }
        } else if (user) {
            ffcFantasyState.teamName = `Escudería de ${user.displayName || user.email.split('@')[0]}`;
        }
    } catch (e) {
        console.warn("Error loading fantasy team from local storage:", e);
    }
}

// In-memory cache of community fantasy teams synced from Firestore/Server
var cloudFantasyTeams = [];
var isFantasyLeaderboardListening = false;

function initFantasyLeaderboardRealtime() {
    if (isFantasyLeaderboardListening) return;
    isFantasyLeaderboardListening = true;

    // 1. Initial preload from server API backup
    fetch('/api/fantasy/teams')
        .then(r => r.json())
        .then(data => {
            if (data && Array.isArray(data.teams) && data.teams.length > 0) {
                cloudFantasyTeams = data.teams;
                if (typeof ffcFantasyState !== "undefined" && ffcFantasyState.activeSubTab === "leaderboard") {
                    renderFantasyLeaderboard();
                }
            }
        })
        .catch(() => {});

    // 2. Real-time Firebase Firestore synchronization
    if (typeof db !== "undefined") {
        try {
            onSnapshot(collection(db, "fantasy_leaderboard"), (snapshot) => {
                const list = [];
                snapshot.forEach(docSnap => {
                    const data = docSnap.data();
                    if (data && (data.teamName || data.managerName)) {
                        list.push({ ...data, id: docSnap.id });
                    }
                });
                if (list.length > 0) {
                    cloudFantasyTeams = list;
                }
                if (typeof ffcFantasyState !== "undefined" && ffcFantasyState.activeSubTab === "leaderboard") {
                    renderFantasyLeaderboard();
                }
            }, (err) => {
                console.warn("Firestore error on fantasy_leaderboard snapshot:", err);
            });
        } catch (e) {
            console.warn("Error setting up fantasy_leaderboard listener:", e);
        }
    }
}
window.initFantasyLeaderboardRealtime = initFantasyLeaderboardRealtime;

function updateFantasyWithNewStandings() {
    if (typeof renderAdminMarketSentimentWidget === "function") {
        renderAdminMarketSentimentWidget();
    }
    if (typeof ffcFantasyState === "undefined" || !ffcFantasyState) return;

    // 1. Refresh user team HUD and slots with latest driver values and points
    if (typeof renderFantasyHUD === "function") {
        renderFantasyHUD();
    }
    if (typeof renderFantasySlots === "function") {
        renderFantasySlots();
    }

    // 2. If market sub-tab is open, update driver cards with updated prices & points
    if (ffcFantasyState.activeSubTab === "market" && typeof renderFantasyMarketGrid === "function") {
        renderFantasyMarketGrid();
    }

    // 3. Re-calculate and render all teams on the leaderboard dynamically
    if (typeof renderFantasyLeaderboard === "function") {
        renderFantasyLeaderboard();
    }
}
window.updateFantasyWithNewStandings = updateFantasyWithNewStandings;

async function saveFantasyTeamToStorage() {
    try {
        const user = getFantasyCurrentUser();
        const cleanDocId = user && user.email 
            ? user.email.toLowerCase().trim().replace(/[^a-z0-9_]/g, "_")
            : null;
        const userKey = cleanDocId 
            ? ("ffc_fantasy_team_" + cleanDocId) 
            : FANTASY_LOCAL_STORAGE_KEY;

        const dataToSave = {
            teamName: ffcFantasyState.teamName,
            driver1: ffcFantasyState.driver1,
            driver2: ffcFantasyState.driver2,
            driver3: ffcFantasyState.driver3,
            team: ffcFantasyState.team,
            turboDriver: ffcFantasyState.turboDriver,
            roundLineups: ffcFantasyState.roundLineups || {},
            updatedAt: new Date().toISOString()
        };
        localStorage.setItem(userKey, JSON.stringify(dataToSave));
        localStorage.setItem(FANTASY_LOCAL_STORAGE_KEY, JSON.stringify(dataToSave));

        const metrics = calculateFantasyMetrics();

        // Immediately update in-memory cloudFantasyTeams for live UI reactivity
        if (user && user.email) {
            const teamPayload = {
                userId: cleanDocId,
                managerName: user.displayName || user.email.split("@")[0],
                email: user.email,
                teamName: ffcFantasyState.teamName,
                driver1: ffcFantasyState.driver1,
                driver2: ffcFantasyState.driver2,
                driver3: ffcFantasyState.driver3,
                team: ffcFantasyState.team,
                turboDriver: ffcFantasyState.turboDriver,
                roundLineups: ffcFantasyState.roundLineups || {},
                totalPoints: metrics.totalPts,
                teamValue: metrics.spent,
                updatedAt: new Date().toISOString()
            };

            const existingIdx = cloudFantasyTeams.findIndex(t => 
                (t.userId && t.userId === cleanDocId) ||
                (t.email && t.email.toLowerCase() === user.email.toLowerCase())
            );
            if (existingIdx >= 0) {
                cloudFantasyTeams[existingIdx] = { ...cloudFantasyTeams[existingIdx], ...teamPayload };
            } else {
                cloudFantasyTeams.push(teamPayload);
            }

            // Dual persistence: Server REST API
            fetch('/api/fantasy/teams', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(teamPayload)
            }).catch(e => console.warn("Failed saving team to server backup:", e));

            // Sync with Cloud Firestore
            if (typeof db !== "undefined") {
                // 1. Update user profile document
                try {
                    await setDoc(doc(db, "usuarios", cleanDocId), {
                        fantasyTeam: {
                            ...dataToSave,
                            totalPoints: metrics.totalPts,
                            teamValue: metrics.spent
                        }
                    }, { merge: true });
                } catch (errUser) {
                    console.warn("Firestore error updating user fantasy team:", errUser);
                }

                // 2. Update fantasy leaderboard document
                try {
                    await setDoc(doc(db, "fantasy_leaderboard", cleanDocId), teamPayload, { merge: true });
                } catch (errLb) {
                    console.warn("Firestore error updating fantasy leaderboard:", errLb);
                }
            }
        }
    } catch (e) {
        console.warn("Error saving fantasy team:", e);
    }
}

// Load cloud fantasy team if available when user logs in
async function syncUserFantasyTeamFromCloud(user) {
    if (!user || !user.email) return;
    try {
        const cleanDocId = user.email.toLowerCase().trim().replace(/[^a-z0-9_]/g, "_");
        let teamData = null;

        // 1. Try Firestore usuarios collection
        if (typeof db !== "undefined") {
            try {
                const snap = await getDoc(doc(db, "usuarios", cleanDocId));
                if (snap.exists() && snap.data().fantasyTeam) {
                    teamData = snap.data().fantasyTeam;
                }
            } catch (e) {}

            // 2. Try Firestore fantasy_leaderboard collection
            if (!teamData) {
                try {
                    const snapLb = await getDoc(doc(db, "fantasy_leaderboard", cleanDocId));
                    if (snapLb.exists()) {
                        teamData = snapLb.data();
                    }
                } catch (e) {}
            }
        }

        // 3. Try Server REST API backup
        if (!teamData) {
            try {
                const res = await fetch('/api/fantasy/teams');
                if (res.ok) {
                    const sData = await res.json();
                    if (sData && Array.isArray(sData.teams)) {
                        const found = sData.teams.find(t => 
                            (t.userId && t.userId === cleanDocId) ||
                            (t.email && t.email.toLowerCase() === user.email.toLowerCase())
                        );
                        if (found) teamData = found;
                    }
                }
            } catch (e) {}
        }

        if (teamData) {
            ffcFantasyState.teamName = teamData.teamName || ffcFantasyState.teamName;
            ffcFantasyState.driver1 = teamData.driver1 || null;
            ffcFantasyState.driver2 = teamData.driver2 || null;
            ffcFantasyState.driver3 = teamData.driver3 || null;
            ffcFantasyState.team = teamData.team || null;
            ffcFantasyState.turboDriver = teamData.turboDriver || null;
            ffcFantasyState.roundLineups = teamData.roundLineups || {};
            
            const userKey = "ffc_fantasy_team_" + cleanDocId;
            const dataToSave = {
                teamName: ffcFantasyState.teamName,
                driver1: ffcFantasyState.driver1,
                driver2: ffcFantasyState.driver2,
                driver3: ffcFantasyState.driver3,
                team: ffcFantasyState.team,
                turboDriver: ffcFantasyState.turboDriver,
                roundLineups: ffcFantasyState.roundLineups,
                updatedAt: new Date().toISOString()
            };
            try {
                localStorage.setItem(userKey, JSON.stringify(dataToSave));
                localStorage.setItem(FANTASY_LOCAL_STORAGE_KEY, JSON.stringify(dataToSave));
            } catch (e) {}

            renderFantasyPortal();
        }
    } catch (e) {
        console.warn("Error syncing user fantasy team from cloud:", e);
    }
}

// Navigation Functions
function openFantasyPortal() {
    isFantasyModuleInitialized = true;
    window.isFantasyModuleInitialized = true;
    initFantasyLeaderboardRealtime();

    const currentUser = getFantasyCurrentUser();
    if (currentUser) {
        syncUserFantasyTeamFromCloud(currentUser);
    }

    const mainContent = document.getElementById("mainSiteContent");
    const fantasyView = document.getElementById("fantasyView");
    const navFantasy = document.getElementById("navFantasy");

    if (mainContent) mainContent.style.display = "none";
    if (fantasyView) {
        fantasyView.style.display = "block";
        window.scrollTo({ top: 0, behavior: "smooth" });
    }

    // Update active nav styling
    document.querySelectorAll(".nav-links a").forEach(a => a.classList.remove("active"));
    if (navFantasy) navFantasy.classList.add("active");

    // Close mobile nav drawer if open
    const navLinks = document.querySelector(".nav-links");
    if (navLinks) {
        navLinks.classList.remove("active");
        navLinks.classList.remove("mobile-open");
    }

    // Set URL hash cleanly
    try {
        if (window.location.hash !== "#fantasy") {
            window.history.pushState(null, "", "#fantasy");
        }
    } catch (e) {
        try {
            window.location.hash = "#fantasy";
        } catch (err) {}
    }

    renderFantasyPortal();
}
window.openFantasyPortal = openFantasyPortal;
window._renderFantasyPortalInternal = renderFantasyPortal;

function closeFantasyPortal(targetAnchor = null) {
    const mainContent = document.getElementById("mainSiteContent");
    const fantasyView = document.getElementById("fantasyView");
    const navFantasy = document.getElementById("navFantasy");

    if (fantasyView) fantasyView.style.display = "none";
    if (mainContent) mainContent.style.display = "block";
    if (navFantasy) navFantasy.classList.remove("active");

    const navLinks = document.querySelector(".nav-links");
    if (navLinks) {
        navLinks.classList.remove("active");
        navLinks.classList.remove("mobile-open");
    }

    if (targetAnchor && targetAnchor !== "#fantasy") {
        try {
            window.location.hash = targetAnchor;
            const targetEl = document.querySelector(targetAnchor);
            if (targetEl) {
                targetEl.scrollIntoView({ behavior: "smooth" });
            }
        } catch (e) {}
    } else {
        try {
            window.history.pushState(null, "", window.location.pathname);
        } catch (e) {
            try {
                window.location.hash = "";
            } catch (err) {}
        }
        window.scrollTo({ top: 0, behavior: "smooth" });
    }
}
window.closeFantasyPortal = closeFantasyPortal;

// Fantasy Sub-Tab Switching
function switchFantasySubTab(tabName) {
    ffcFantasyState.activeSubTab = tabName;

    const tabMap = {
        team: { btn: "tabBtnFantasyTeam", content: "subtabContentTeam" },
        market: { btn: "tabBtnFantasyMarket", content: "subtabContentMarket" },
        leaderboard: { btn: "tabBtnFantasyLeaderboard", content: "subtabContentLeaderboard" },
        rules: { btn: "tabBtnFantasyRules", content: "subtabContentRules" }
    };

    Object.keys(tabMap).forEach(key => {
        const btn = document.getElementById(tabMap[key].btn);
        const content = document.getElementById(tabMap[key].content);
        const isActive = key === tabName;

        if (btn) {
            btn.classList.toggle("active", isActive);
            btn.setAttribute("aria-selected", isActive ? "true" : "false");
        }
        if (content) {
            content.style.display = isActive ? "block" : "none";
            content.classList.toggle("active", isActive);
        }
    });

    if (tabName === "market") {
        renderFantasyMarketGrid();
    } else if (tabName === "leaderboard") {
        renderFantasyLeaderboard();
    }
}

// Render HUD metrics
function renderFantasyHUD() {
    const isLogged = isFantasyUserLoggedIn();
    const currentUser = getFantasyCurrentUser();
    const isEn = typeof currentLanguage !== "undefined" && currentLanguage === "en";

    // Toggle Login Requirement Banner
    const authBanner = document.getElementById("fantasyAuthBanner");
    if (authBanner) {
        authBanner.style.display = isLogged ? "none" : "flex";
    }

    const metrics = calculateFantasyMetrics();

    const budgetEl = document.getElementById("fantasyBudgetRemaining");
    const budgetCard = document.querySelector(".fantasy-hud-card.hud-budget");
    const budgetBar = document.getElementById("fantasyBudgetBar");
    const budgetSub = document.getElementById("hudBudgetSub");

    if (budgetEl) budgetEl.textContent = `${metrics.remaining.toFixed(1)}M €`;
    if (budgetBar) {
        const pct = Math.max(0, Math.min(100, (metrics.remaining / FANTASY_INITIAL_BUDGET) * 100));
        budgetBar.style.width = `${pct}%`;
        budgetBar.classList.toggle("warning", pct < 25 && pct >= 0);
        budgetBar.classList.toggle("danger", pct < 0);
    }
    if (budgetCard) {
        budgetCard.classList.toggle("is-low", metrics.remaining < 15 && metrics.remaining >= 0);
        budgetCard.classList.toggle("is-over", metrics.remaining < 0);
    }
    if (budgetSub) {
        if (metrics.remaining < 0) {
            budgetSub.innerHTML = `<span style="color:#ef4444; font-weight:700;">⚠️ ${isEn ? "Excess: -" : "Exceso: -"}${Math.abs(metrics.remaining).toFixed(1)}M € (${isEn ? "Sell picks" : "Vende fichajes"})</span>`;
        } else {
            budgetSub.textContent = isEn 
                ? `Spent: ${metrics.spent.toFixed(1)}M € of ${FANTASY_INITIAL_BUDGET.toFixed(1)}M € starting`
                : `Gastados: ${metrics.spent.toFixed(1)}M € de ${FANTASY_INITIAL_BUDGET.toFixed(1)}M €`;
        }
    }

    const valueEl = document.getElementById("fantasyTeamValue");
    const slotsCountEl = document.getElementById("fantasySlotsCount");
    if (valueEl) valueEl.textContent = `${metrics.spent.toFixed(1)}M €`;
    if (slotsCountEl) {
        slotsCountEl.textContent = isLogged 
            ? (isEn ? `${metrics.filledSlots} / 4 Signings completed` : `${metrics.filledSlots} / 4 Fichajes completados`)
            : (isEn ? "Log in to play" : "Inicia sesión para jugar");
    }

    const ptsEl = document.getElementById("fantasyTotalPts");
    if (ptsEl) ptsEl.innerHTML = `${metrics.totalPts} <span class="pts-unit">PTS</span>`;

    // Rank HUD Card
    const rankEl = document.getElementById("fantasyRankPosition");
    const rankSub = document.getElementById("fantasyRankSub");
    if (!isLogged) {
        if (rankEl) rankEl.textContent = isEn ? "🔒 Log In" : "🔒 Inicia Sesión";
        if (rankSub) rankSub.textContent = isEn ? "To compete in the league" : "Para competir en la liga";
    } else {
        if (rankSub) rankSub.textContent = isEn ? "Overall Standings" : "Clasificación General";
    }

    // Team name input
    const teamNameInput = document.getElementById("fantasyTeamNameInput");
    const saveHint = document.getElementById("fantasySaveHint");
    if (teamNameInput && document.activeElement !== teamNameInput) {
        if (isLogged) {
            teamNameInput.value = ffcFantasyState.teamName || (isEn ? `${currentUser.displayName || currentUser.email.split('@')[0]}'s Team` : `Escudería de ${currentUser.displayName || currentUser.email.split('@')[0]}`);
            teamNameInput.disabled = false;
            teamNameInput.placeholder = isEn ? "Your Team Name" : "Nombre de tu Escudería";
            if (saveHint) {
                saveHint.textContent = isEn ? `Manager: ${currentUser.displayName || currentUser.email.split('@')[0]} · Synced to cloud` : `Manager: ${currentUser.displayName || currentUser.email.split('@')[0]} · Sincronizado en la nube`;
            }
        } else {
            teamNameInput.value = "";
            teamNameInput.disabled = true;
            teamNameInput.placeholder = isEn ? "Log in to manage your team" : "Inicia sesión para gestionar tu equipo";
            if (saveHint) {
                saveHint.textContent = isEn ? "You must log in to save your team" : "Debes iniciar sesión para guardar tu escudería";
            }
        }
    }
}

// Render Slot Card
function renderSlotCard(containerId, slotType, slotIndex, currentItem, pts, isTurbo) {
    const container = document.getElementById(containerId);
    if (!container) return;

    const isLogged = isFantasyUserLoggedIn();
    const isLocked = isFantasyMarketLocked();
    const isEn = typeof currentLanguage !== "undefined" && currentLanguage === "en";

    if (!currentItem) {
        // Empty Slot State
        const label = slotType === "driver" ? (isEn ? `Driver ${slotIndex}` : `Piloto ${slotIndex}`) : (isEn ? "Constructor" : "Constructor");
        const icon = slotType === "driver" ? "🏎️" : "🏭";
        const btnText = isLocked 
            ? (isEn ? "🔒 Market Locked" : "🔒 Mercado Bloqueado") 
            : (isLogged ? (isEn ? "Go to Market" : "Ir al Mercado") : (isEn ? "Log In" : "Iniciar Sesión"));
        const btnClick = isLocked 
            ? "handleLockedAction()" 
            : `handleEmptySlotClick('${slotType}')`;
        const lockBtnClass = isLocked ? "is-locked" : "";

        container.innerHTML = `
            <div class="slot-empty-body" onclick="${btnClick}">
                <div class="slot-empty-icon">${isLocked ? "🔒" : (isLogged ? icon : "🔒")}</div>
                <div class="slot-empty-title">${isLocked ? `${label} (${isEn ? "Locked" : "Bloqueado"})` : (isLogged ? `+ ${isEn ? "Sign " + label : "Fichar " + label}` : `${label} ${isEn ? "Locked" : "Bloqueado"}`)}</div>
                <div class="slot-empty-sub">${isLocked ? (isEn ? "Lineups frozen during race" : "Alineaciones congeladas por carrera") : (isLogged ? (isEn ? "Vacant slot available" : "Vacante disponible") : (isEn ? "Log in to sign" : "Inicia sesión para fichar"))}</div>
                <button type="button" class="slot-empty-btn ${lockBtnClass}">${btnText}</button>
            </div>
        `;
    } else {
        // Filled Slot State
        if (slotType === "driver") {
            const driverData = getFantasyDriverData(currentItem);
            const flag = getOfficialDriverFlag(currentItem);
            const team = driverData ? driverData.team : "FFC";
            const price = getDriverFantasyPrice(currentItem);
            const flu = getDriverPriceFluctuation(currentItem);
            const avatarUrl = driverData && driverData.avatarUrl ? driverData.avatarUrl : null;
            const turboClass = isTurbo ? "is-active" : "";
            const turboLabel = isTurbo ? (isEn ? "⭐ Turbo Active (x2 Pts)" : "⭐ Turbo Activo (x2 Pts)") : (isEn ? "⭐ Activate Turbo (x2)" : "⭐ Activar Turbo (x2)");

            const sellBtnHtml = isLocked
                ? `<button type="button" class="slot-sell-btn is-locked" onclick="handleLockedAction()" title="${isEn ? "Market locked during race" : "Mercado bloqueado por carrera"}">🔒 ${isEn ? "Locked" : "Bloqueado"}</button>`
                : `<button type="button" class="slot-sell-btn" onclick="handleSellSlot('driver${slotIndex}')">✕ ${isEn ? "Sell" : "Vender"}</button>`;

            const turboBtnHtml = isLocked
                ? `<button type="button" class="slot-turbo-btn ${turboClass} is-locked" onclick="handleLockedAction()" title="${isEn ? "Market locked during race" : "Mercado bloqueado por carrera"}">🔒 ${turboLabel}</button>`
                : `<button type="button" class="slot-turbo-btn ${turboClass}" onclick="handleToggleTurbo('${escapeHtml(currentItem)}')">${turboLabel}</button>`;

            container.innerHTML = `
                <div class="slot-filled-card">
                    <div class="slot-header-tag">
                        <span class="slot-type-label">${isEn ? "DRIVER " + slotIndex : "PILOTO " + slotIndex}</span>
                        ${sellBtnHtml}
                    </div>
                    <div class="slot-avatar-wrap">
                        ${avatarUrl 
                            ? `<img src="${escapeHtml(avatarUrl)}" class="slot-avatar-img" alt="${escapeHtml(currentItem)}" onerror="this.outerHTML='<div class=\\'slot-team-logo-icon\\'>🏎️</div>'">`
                            : `<div class="slot-team-logo-icon">🏎️</div>`
                        }
                        <div class="slot-name-block">
                            <div class="slot-item-name" title="${escapeHtml(currentItem)}">${flag} ${escapeHtml(currentItem)}</div>
                            <span class="ranking-team-pill ${getTeamClass(team)}"><span class="team-dot"></span>${escapeHtml(team)}</span>
                        </div>
                    </div>
                    <div class="slot-meta-row">
                        <div class="slot-meta-item">
                            <span class="slot-meta-lbl">${isEn ? "VALUE" : "VALOR"}</span>
                            <span class="slot-meta-val price">
                                ${price.toFixed(1)}M €
                                <span class="price-delta-badge ${flu.formClass}" title="${isEn ? "Value fluctuation: " + flu.deltaFormatted : "Fluctuación del valor: " + flu.deltaFormatted}">${flu.deltaFormatted}</span>
                            </span>
                        </div>
                        <div class="slot-meta-item" style="text-align: right;">
                            <span class="slot-meta-lbl">${isEn ? "POINTS" : "PUNTOS"}</span>
                            <span class="slot-meta-val pts">${pts} PTS</span>
                        </div>
                    </div>
                    ${turboBtnHtml}
                </div>
            `;
        } else {
            // Constructor Slot
            const price = getConstructorFantasyPrice(currentItem);
            const flu = getTeamPriceFluctuation(currentItem);
            const sellBtnHtml = isLocked
                ? `<button type="button" class="slot-sell-btn is-locked" onclick="handleLockedAction()" title="${isEn ? "Market locked during race" : "Mercado bloqueado por carrera"}">🔒 ${isEn ? "Locked" : "Bloqueado"}</button>`
                : `<button type="button" class="slot-sell-btn" onclick="handleSellSlot('team')">✕ ${isEn ? "Sell" : "Vender"}</button>`;

            container.innerHTML = `
                <div class="slot-filled-card">
                    <div class="slot-header-tag">
                        <span class="slot-type-label">${isEn ? "OFFICIAL TEAM" : "ESCUDERÍA OFICIAL"}</span>
                        ${sellBtnHtml}
                    </div>
                    <div class="slot-avatar-wrap">
                        <div class="slot-team-logo-icon">🏭</div>
                        <div class="slot-name-block">
                            <div class="slot-item-name" title="${escapeHtml(currentItem)}">${escapeHtml(currentItem)}</div>
                            <span class="ranking-team-pill ${getTeamClass(currentItem)}"><span class="team-dot"></span>Constructor</span>
                        </div>
                    </div>
                    <div class="slot-meta-row">
                        <div class="slot-meta-item">
                            <span class="slot-meta-lbl">${isEn ? "VALUE" : "VALOR"}</span>
                            <span class="slot-meta-val price">
                                ${price.toFixed(1)}M €
                                <span class="price-delta-badge ${flu.formClass}" title="${isEn ? "Value fluctuation: " + flu.deltaFormatted : "Fluctuación del valor: " + flu.deltaFormatted}">${flu.deltaFormatted}</span>
                            </span>
                        </div>
                        <div class="slot-meta-item" style="text-align: right;">
                            <span class="slot-meta-lbl">${isEn ? "POINTS" : "PUNTOS"}</span>
                            <span class="slot-meta-val pts">${pts} PTS</span>
                        </div>
                    </div>
                    <div style="font-size: 11px; color: #6b7280; text-align: center; margin-top: auto; padding: 6px;">
                        ${isEn ? "Sums the points of all its cars in the race" : "Suma los puntos de todos sus monoplazas en carrera"}
                    </div>
                </div>
            `;
        }
    }
}

// Render All 4 Team Slots
function renderFantasySlots() {
    const metrics = calculateFantasyMetrics();
    renderSlotCard("fantasySlotDriver1", "driver", 1, ffcFantasyState.driver1, metrics.d1Pts, ffcFantasyState.turboDriver === ffcFantasyState.driver1);
    renderSlotCard("fantasySlotDriver2", "driver", 2, ffcFantasyState.driver2, metrics.d2Pts, ffcFantasyState.turboDriver === ffcFantasyState.driver2);
    renderSlotCard("fantasySlotDriver3", "driver", 3, ffcFantasyState.driver3, metrics.d3Pts, ffcFantasyState.turboDriver === ffcFantasyState.driver3);
    renderSlotCard("fantasySlotConstructor", "team", 4, ffcFantasyState.team, metrics.teamPts, false);
}
window.renderFantasySlots = renderFantasySlots;

// Empty Slot Click Handler
window.handleEmptySlotClick = function(slotType) {
    if (isFantasyMarketLocked()) {
        handleLockedAction();
        return;
    }
    if (!requireFantasyAuth()) return;
    if (slotType === "driver") {
        setMarketFilter("drivers");
    } else {
        setMarketFilter("teams");
    }
    switchFantasySubTab("market");
};

// Sell Slot Handler
window.handleSellSlot = function(slotKey) {
    if (isFantasyMarketLocked()) {
        handleLockedAction();
        return;
    }
    if (!requireFantasyAuth()) return;

    if (slotKey === "driver1") {
        if (ffcFantasyState.turboDriver === ffcFantasyState.driver1) ffcFantasyState.turboDriver = null;
        ffcFantasyState.driver1 = null;
    } else if (slotKey === "driver2") {
        if (ffcFantasyState.turboDriver === ffcFantasyState.driver2) ffcFantasyState.turboDriver = null;
        ffcFantasyState.driver2 = null;
    } else if (slotKey === "driver3") {
        if (ffcFantasyState.turboDriver === ffcFantasyState.driver3) ffcFantasyState.turboDriver = null;
        ffcFantasyState.driver3 = null;
    } else if (slotKey === "team") {
        ffcFantasyState.team = null;
    }

    // Auto-reassign turbo if one driver remains and turbo was cleared
    if (!ffcFantasyState.turboDriver) {
        ffcFantasyState.turboDriver = ffcFantasyState.driver1 || ffcFantasyState.driver2 || ffcFantasyState.driver3 || null;
    }

    saveFantasyTeamToStorage();
    renderFantasyHUD();
    renderFantasySlots();
    if (ffcFantasyState.activeSubTab === "market") {
        renderFantasyMarketGrid();
    }
};

// Toggle Turbo Driver Handler
window.handleToggleTurbo = function(driverName) {
    if (isFantasyMarketLocked()) {
        handleLockedAction();
        return;
    }
    if (!requireFantasyAuth()) return;
    if (!driverName) return;
    ffcFantasyState.turboDriver = driverName;
    saveFantasyTeamToStorage();
    renderFantasyHUD();
    renderFantasySlots();
};

// Sign Driver Action
window.handleSignDriver = function(driverName) {
    if (isFantasyMarketLocked()) {
        handleLockedAction();
        return;
    }
    if (!requireFantasyAuth()) return;
    if (!driverName) return;

    // Check if already signed
    if (ffcFantasyState.driver1 === driverName || ffcFantasyState.driver2 === driverName || ffcFantasyState.driver3 === driverName) {
        return;
    }

    // Check open driver slot
    let targetSlot = null;
    if (!ffcFantasyState.driver1) targetSlot = "driver1";
    else if (!ffcFantasyState.driver2) targetSlot = "driver2";
    else if (!ffcFantasyState.driver3) targetSlot = "driver3";

    if (!targetSlot) {
        alert("Ya tienes los 3 pilotos fichados. Vende a uno de tus pilotos en 'Mi Escudería' para poder incorporar a otro.");
        return;
    }

    const price = getDriverFantasyPrice(driverName);
    const metrics = calculateFantasyMetrics();
    if (price > metrics.remaining) {
        alert(`Presupuesto insuficiente: necesitas ${price.toFixed(1)}M€ y dispones de ${metrics.remaining.toFixed(1)}M€.`);
        return;
    }

    ffcFantasyState[targetSlot] = driverName;
    if (!ffcFantasyState.turboDriver) {
        ffcFantasyState.turboDriver = driverName;
    }

    saveFantasyTeamToStorage();
    renderFantasyHUD();
    renderFantasySlots();
    renderFantasyMarketGrid();
};

// Sign Constructor Action
window.handleSignConstructor = function(teamName) {
    if (isFantasyMarketLocked()) {
        handleLockedAction();
        return;
    }
    if (!requireFantasyAuth()) return;
    if (!teamName) return;

    if (ffcFantasyState.team === teamName) return;

    const price = getConstructorFantasyPrice(teamName);
    const metrics = calculateFantasyMetrics();
    const currentTeamRefund = ffcFantasyState.team ? getConstructorFantasyPrice(ffcFantasyState.team) : 0;
    const effectiveRemaining = metrics.remaining + currentTeamRefund;

    if (price > effectiveRemaining) {
        alert(`Presupuesto insuficiente: necesitas ${price.toFixed(1)}M€ y dispones de ${effectiveRemaining.toFixed(1)}M€.`);
        return;
    }

    ffcFantasyState.team = teamName;
    saveFantasyTeamToStorage();
    renderFantasyHUD();
    renderFantasySlots();
    renderFantasyMarketGrid();
};

// Market Filter Setters
function setMarketFilter(filterKey) {
    ffcFantasyState.currentFilter = filterKey;
    document.querySelectorAll(".market-filter-pill").forEach(btn => {
        btn.classList.toggle("active", btn.getAttribute("data-filter") === filterKey);
    });
    renderFantasyMarketGrid();
}

// Render Fantasy Market Grid
function renderFantasyMarketGrid() {
    const grid = document.getElementById("fantasyMarketGrid");
    if (!grid) return;

    const metrics = calculateFantasyMetrics();
    const filter = ffcFantasyState.currentFilter;
    const query = (ffcFantasyState.searchQuery || "").trim().toLowerCase();
    const sortBy = ffcFantasyState.sortBy;
    const isEn = typeof currentLanguage !== "undefined" && currentLanguage === "en";

    // Gather Drivers
    const allDrivers = (typeof ffc2010SeasonDrivers !== "undefined" && Array.isArray(ffc2010SeasonDrivers))
        ? ffc2010SeasonDrivers
        : (typeof defaultStandings !== "undefined" ? defaultStandings : []);

    const driverCards = allDrivers.map(d => {
        const name = d.driver;
        const team = d.team;
        const pts = getDriverFantasyPoints(name);
        const flu = getDriverPriceFluctuation(name);
        const price = flu.currentPrice;
        const isOwned = (ffcFantasyState.driver1 === name || ffcFantasyState.driver2 === name || ffcFantasyState.driver3 === name);
        const flag = getOfficialDriverFlag(name);
        const avatarUrl = d.avatarUrl || null;

        return {
            type: "driver",
            name,
            team,
            pts,
            price,
            flu,
            isOwned,
            flag,
            avatarUrl
        };
    });

    // Gather Constructors
    const allTeams = typeof F1_TEAMS !== "undefined" ? F1_TEAMS : ["Red Bull", "Ferrari", "McLaren", "Mercedes", "Renault", "Williams", "Force India", "Sauber", "Toro Rosso", "Lotus", "HRT", "Virgin"];
    const teamCards = allTeams.map(teamName => {
        const pts = getTeamFantasyPoints(teamName);
        const flu = getTeamPriceFluctuation(teamName);
        const price = flu.currentPrice;
        const isOwned = ffcFantasyState.team === teamName;

        return {
            type: "team",
            name: teamName,
            team: teamName,
            pts,
            price,
            flu,
            isOwned,
            flag: "🏭",
            avatarUrl: null
        };
    });

    // Combine according to filter
    let items = [];
    if (filter === "drivers") items = driverCards;
    else if (filter === "teams") items = teamCards;
    else if (filter === "rising") items = [...driverCards, ...teamCards].filter(i => i.flu && i.flu.delta > 0);
    else if (filter === "falling") items = [...driverCards, ...teamCards].filter(i => i.flu && i.flu.delta < 0);
    else items = [...driverCards, ...teamCards];

    // Filter by affordable
    if (filter === "affordable") {
        items = items.filter(item => item.isOwned || item.price <= metrics.remaining);
    }

    // Filter by search query
    if (query) {
        items = items.filter(item => 
            item.name.toLowerCase().includes(query) || 
            item.team.toLowerCase().includes(query)
        );
    }

    // Sort items
    items.sort((a, b) => {
        if (sortBy === "price-desc") return b.price - a.price;
        if (sortBy === "price-asc") return a.price - b.price;
        if (sortBy === "pts-desc") return b.pts - a.pts;
        if (sortBy === "rising-desc" || sortBy === "fluct-desc") return (b.flu ? b.flu.delta : 0) - (a.flu ? a.flu.delta : 0);
        if (sortBy === "falling-desc" || sortBy === "fluct-asc") return (a.flu ? a.flu.delta : 0) - (b.flu ? b.flu.delta : 0);
        if (sortBy === "name-asc") return a.name.localeCompare(b.name);
        return 0;
    });

    // Update Counter
    const counterPill = document.getElementById("marketCountPill");
    if (counterPill) counterPill.textContent = items.length;

    if (items.length === 0) {
        grid.innerHTML = `
            <div style="grid-column: 1/-1; text-align: center; padding: 48px 20px; color: #6b7280; font-size: 14px;">
                ${isEn ? "No drivers or constructors found matching your search." : "No se encontraron pilotos o constructores que coincidan con la búsqueda."}
            </div>
        `;
        return;
    }

    const driverSlotsFull = Boolean(ffcFantasyState.driver1 && ffcFantasyState.driver2 && ffcFantasyState.driver3);
    const isLogged = isFantasyUserLoggedIn();
    const isLocked = isFantasyMarketLocked();

    grid.innerHTML = items.map(item => {
        const isDriver = item.type === "driver";
        const canAfford = item.price <= metrics.remaining;
        
        let actionBtnHtml = "";
        if (isLocked) {
            if (item.isOwned) {
                actionBtnHtml = `<button type="button" class="market-action-btn owned-btn is-locked" onclick="handleLockedAction()" title="${isEn ? "Market locked during race" : "Mercado bloqueado por carrera"}">🔒 ${isEn ? "Signed (Locked)" : "Fichado (Bloqueado)"}</button>`;
            } else {
                actionBtnHtml = `<button type="button" class="market-action-btn is-locked" onclick="handleLockedAction()" title="${isEn ? "Market locked during race" : "Mercado bloqueado por carrera"}">🔒 ${isEn ? "Market Locked" : "Mercado Bloqueado"}</button>`;
            }
        } else if (!isLogged) {
            actionBtnHtml = `<button type="button" class="market-action-btn sign-btn" onclick="requireFantasyAuth()" title="${isEn ? "Log in to sign" : "Inicia sesión para fichar"}">🔒 ${isEn ? "Log In to Sign" : "Iniciar Sesión para Fichar"}</button>`;
        } else if (item.isOwned) {
            actionBtnHtml = `<button type="button" class="market-action-btn owned-btn" onclick="handleSellFromMarket('${item.type}', '${escapeHtml(item.name)}')">${isEn ? "Signed ✓ (Sell)" : "Fichado ✓ (Vender)"}</button>`;
        } else if (isDriver && driverSlotsFull) {
            actionBtnHtml = `<button type="button" class="market-action-btn" disabled>${isEn ? "3/3 Drivers Full" : "3/3 Pilotos Lleno"}</button>`;
        } else if (!canAfford) {
            actionBtnHtml = `<button type="button" class="market-action-btn" disabled>${isEn ? "No Budget" : "Sin Presupuesto"} (${item.price.toFixed(1)}M)</button>`;
        } else {
            const clickFn = isDriver ? `handleSignDriver('${escapeHtml(item.name)}')` : `handleSignConstructor('${escapeHtml(item.name)}')`;
            actionBtnHtml = `<button type="button" class="market-action-btn sign-btn" onclick="${clickFn}">+ ${isEn ? "Sign for " : "Fichar por "}${item.price.toFixed(1)}M €</button>`;
        }

        return `
            <div class="market-card ${item.isOwned ? 'is-owned' : ''}">
                <div class="market-card-top">
                    ${isDriver 
                        ? (item.avatarUrl 
                            ? `<img src="${escapeHtml(item.avatarUrl)}" class="market-card-avatar" alt="${escapeHtml(item.name)}" onerror="this.outerHTML='<div class=\\'market-card-team-icon\\'>🏎️</div>'">`
                            : `<div class="market-card-team-icon">🏎️</div>`
                        )
                        : `<div class="market-card-team-icon">🏭</div>`
                    }
                    <div class="market-card-info">
                        <div class="market-card-name" title="${escapeHtml(item.name)}">${getFlagHtml(item.flag, 16)} ${escapeHtml(item.name)}</div>
                        <span class="ranking-team-pill ${getTeamClass(item.team)}"><span class="team-dot"></span>${escapeHtml(item.team)}</span>
                    </div>
                </div>
                ${item.flu ? `<div class="market-form-tag ${item.flu.formClass}">${item.flu.formTag}</div>` : ''}
                <div class="market-card-stats">
                    <div class="market-stat-item">
                        <span class="market-stat-lbl">${isEn ? "PRICE" : "PRECIO"}</span>
                        <span class="market-stat-val price">
                            ${item.price.toFixed(1)}M €
                            ${item.flu ? `<span class="price-delta-badge ${item.flu.formClass}" title="${isEn ? "Fluctuation: " + item.flu.deltaFormatted : "Fluctuación: " + item.flu.deltaFormatted}">${item.flu.deltaFormatted}</span>` : ''}
                        </span>
                    </div>
                    <div class="market-stat-item" style="text-align: right;">
                        <span class="market-stat-lbl">${isEn ? "REAL POINTS" : "PUNTOS REALES"}</span>
                        <span class="market-stat-val pts">${item.pts} PTS</span>
                    </div>
                </div>
                ${actionBtnHtml}
            </div>
        `;
    }).join("");
}
window.renderFantasyMarketGrid = renderFantasyMarketGrid;

// Sell Item Directly from Market
window.handleSellFromMarket = function(type, name) {
    if (isFantasyMarketLocked()) {
        handleLockedAction();
        return;
    }
    if (!requireFantasyAuth()) return;
    if (type === "driver") {
        if (ffcFantasyState.driver1 === name) handleSellSlot("driver1");
        else if (ffcFantasyState.driver2 === name) handleSellSlot("driver2");
        else if (ffcFantasyState.driver3 === name) handleSellSlot("driver3");
    } else {
        handleSellSlot("team");
    }
};

// Render Fantasy Leaderboard
async function renderFantasyLeaderboard() {
    const tbody = document.getElementById("fantasyLeaderboardBody");
    if (!tbody) return;

    const isLogged = isFantasyUserLoggedIn();
    const currentUser = getFantasyCurrentUser();
    const isEn = typeof currentLanguage !== "undefined" && currentLanguage === "en";

    // 1. Gather all community teams from our real-time cloud cache
    let teamsList = Array.isArray(cloudFantasyTeams) ? [...cloudFantasyTeams] : [];

    // 2. If cloud cache is empty (e.g. initial cold load in incognito), fetch from Firestore or server
    if (teamsList.length === 0) {
        if (typeof db !== "undefined") {
            try {
                const snap = await getDocs(collection(db, "fantasy_leaderboard"));
                if (!snap.empty) {
                    snap.forEach(d => {
                        const data = d.data();
                        if (data && (data.teamName || data.managerName)) {
                            teamsList.push({ ...data, id: d.id });
                        }
                    });
                    if (teamsList.length > 0) {
                        cloudFantasyTeams = [...teamsList];
                    }
                }
            } catch (e) {
                console.warn("Could not load fantasy leaderboard from cloud:", e);
            }
        }

        // 3. Fallback to server REST API backup if still empty
        if (teamsList.length === 0) {
            try {
                const resp = await fetch('/api/fantasy/teams');
                if (resp.ok) {
                    const sData = await resp.json();
                    if (sData && Array.isArray(sData.teams) && sData.teams.length > 0) {
                        teamsList = [...sData.teams];
                        cloudFantasyTeams = [...teamsList];
                    }
                }
            } catch (e) {}
        }
    }

    // Always recalculate current user's team live if logged in
    if (isLogged && currentUser) {
        const userEmail = currentUser.email;
        const userDisplayName = currentUser.displayName || (userEmail ? userEmail.split("@")[0] : "Manager FFC");
        const myMetrics = calculateFantasyMetrics();

        const cleanDocId = userEmail ? userEmail.toLowerCase().trim().replace(/[^a-z0-9_]/g, "_") : null;

        // Replace or insert current user's team in the list
        const existingUserIndex = teamsList.findIndex(t => 
            (userEmail && t.email && t.email.toLowerCase() === userEmail.toLowerCase()) || 
            (cleanDocId && t.userId === cleanDocId) ||
            t.isUserTeam === true
        );

        const myTeamEntry = {
            teamName: ffcFantasyState.teamName || (isEn ? `${userDisplayName}'s Team` : `Escudería de ${userDisplayName}`),
            managerName: userDisplayName,
            email: userEmail,
            driver1: ffcFantasyState.driver1,
            driver2: ffcFantasyState.driver2,
            driver3: ffcFantasyState.driver3,
            team: ffcFantasyState.team,
            turboDriver: ffcFantasyState.turboDriver,
            roundLineups: ffcFantasyState.roundLineups || {},
            totalPoints: myMetrics.totalPts,
            teamValue: myMetrics.spent,
            isUserTeam: true
        };

        if (existingUserIndex >= 0) {
            teamsList[existingUserIndex] = { ...teamsList[existingUserIndex], ...myTeamEntry };
        } else if (ffcFantasyState.driver1 || ffcFantasyState.driver2 || ffcFantasyState.driver3 || ffcFantasyState.team) {
            teamsList.push(myTeamEntry);
        }
    }

    // Recalculate points dynamically based on current standings for all teams
    teamsList.forEach(t => {
        const m = calculateFantasyMetrics({
            driver1: t.driver1,
            driver2: t.driver2,
            driver3: t.driver3,
            team: t.team,
            turboDriver: t.turboDriver,
            roundLineups: t.roundLineups || {}
        });
        t.totalPoints = m.totalPts;
        t.teamValue = m.spent;
    });

    // Sort leaderboard by points descending
    teamsList.sort((a, b) => (b.totalPoints || 0) - (a.totalPoints || 0));

    // Update User Rank HUD Card
    const rankEl = document.getElementById("fantasyRankPosition");
    if (rankEl) {
        if (isLogged) {
            const myRankIndex = teamsList.findIndex(t => t.isUserTeam);
            rankEl.textContent = myRankIndex >= 0 ? `#${myRankIndex + 1} / ${teamsList.length}` : "-";
        } else {
            rankEl.textContent = isEn ? "🔒 Log In" : "🔒 Inicia Sesión";
        }
    }

    // If leaderboard has no teams yet
    if (teamsList.length === 0) {
        tbody.innerHTML = `
            <tr>
                <td colspan="5" style="text-align: center; padding: 48px 20px; color: #94a3b8;">
                    <div style="font-size: 32px; margin-bottom: 8px;">🏎️</div>
                    <div style="font-size: 15px; font-weight: 700; color: #f1f5f9; margin-bottom: 4px;">${isEn ? "No registered teams yet" : "Aún no hay escuderías registradas"}</div>
                    <div style="font-size: 13px; color: #64748b;">${isLogged ? (isEn ? "Set up your lineup in 'My Team' to lead the standings!" : "¡Configura tu alineación en 'Mi Escudería' para liderar la clasificación!") : (isEn ? "Log in with your account to create your team and compete in the league." : "Inicia sesión con tu cuenta para crear tu equipo y competir en la liga.")}</div>
                </td>
            </tr>
        `;
        return;
    }

    // Render Table Rows
    tbody.innerHTML = teamsList.map((t, idx) => {
        const isMe = Boolean(t.isUserTeam);
        const pos = idx + 1;
        let posClass = "lb-pos";
        if (pos === 1) posClass += " pos-1";
        else if (pos === 2) posClass += " pos-2";
        else if (pos === 3) posClass += " pos-3";

        const vacantTxt = isEn ? "Vacant" : "Vacante";
        const noTeamTxt = isEn ? "No Team" : "Sin Escudería";
        const myTeamBadge = isEn ? "YOUR TEAM" : "TU EQUIPO";

        const d1Chip = t.driver1 ? `<span class="lb-driver-chip ${t.turboDriver === t.driver1 ? 'is-turbo' : ''}">${t.turboDriver === t.driver1 ? '⭐ ' : ''}${escapeHtml(t.driver1)}</span>` : `<span class="lb-driver-chip" style="opacity:0.4;">${vacantTxt}</span>`;
        const d2Chip = t.driver2 ? `<span class="lb-driver-chip ${t.turboDriver === t.driver2 ? 'is-turbo' : ''}">${t.turboDriver === t.driver2 ? '⭐ ' : ''}${escapeHtml(t.driver2)}</span>` : `<span class="lb-driver-chip" style="opacity:0.4;">${vacantTxt}</span>`;
        const d3Chip = t.driver3 ? `<span class="lb-driver-chip ${t.turboDriver === t.driver3 ? 'is-turbo' : ''}">${t.turboDriver === t.driver3 ? '⭐ ' : ''}${escapeHtml(t.driver3)}</span>` : `<span class="lb-driver-chip" style="opacity:0.4;">${vacantTxt}</span>`;
        const teamChip = t.team ? `<span class="lb-team-chip ranking-team-pill ${getTeamClass(t.team)}"><span class="team-dot"></span>${escapeHtml(t.team)}</span>` : `<span class="lb-team-chip" style="opacity:0.4;">${noTeamTxt}</span>`;

        return `
            <tr class="${isMe ? 'my-team-row' : ''}">
                <td class="${posClass}">${pos}</td>
                <td>
                    <div class="lb-team-name">
                        ${escapeHtml(t.teamName || (isEn ? "FFC Team" : "Escudería FFC"))}
                        ${isMe ? `<span class="my-team-badge">${myTeamBadge}</span>` : ''}
                    </div>
                    <div class="lb-manager-name">Manager: ${escapeHtml(t.managerName || (isEn ? "FFC Driver" : "Piloto FFC"))}</div>
                </td>
                <td>
                    <div class="lb-lineup-chips">
                        ${d1Chip}
                        ${d2Chip}
                        ${d3Chip}
                        ${teamChip}
                    </div>
                </td>
                <td class="lb-val">${(t.teamValue || 0).toFixed(1)}M €</td>
                <td class="lb-pts">${t.totalPoints || 0}</td>
            </tr>
        `;
    }).join("");
}

// Master Render for Fantasy Portal
function renderFantasyPortal() {
    renderFantasyHUD();
    renderFantasySlots();
    if (ffcFantasyState.activeSubTab === "market") {
        renderFantasyMarketGrid();
    } else if (ffcFantasyState.activeSubTab === "leaderboard") {
        renderFantasyLeaderboard();
    }
}

// Initial Wire-Up for Fantasy System
function initFantasyLeague() {
    isFantasyModuleInitialized = true;
    window.isFantasyModuleInitialized = true;
    loadFantasyTeamFromStorage();

    // Fetch initial server lock state fallback
    fetch('/api/fantasy/lock')
        .then(res => res.json())
        .then(data => {
            if (data && typeof data.locked === 'boolean') {
                const current = getSavedSettings();
                if (current.fantasyLocked !== data.locked || data.message) {
                    current.fantasyLocked = data.locked;
                    if (data.message) current.fantasyLockMessage = data.message;
                    currentSettings = current;
                    renderSettingsOnPage(current);
                }
            }
        })
        .catch(() => {});

    if (typeof initFantasyLeaderboardRealtime === "function") {
        initFantasyLeaderboardRealtime();
    }

    // Export global helpers to window
    window.switchFantasySubTab = switchFantasySubTab;
    window.setMarketFilter = setMarketFilter;
    window.requireFantasyAuth = requireFantasyAuth;
    window.handleEmptySlotClick = handleEmptySlotClick;

    // 1. Navigation Button Listeners
    const navFantasy = document.getElementById("navFantasy");
    if (navFantasy) {
        navFantasy.addEventListener("click", (e) => {
            e.preventDefault();
            openFantasyPortal();
        });
    }

    const heroBtnFantasy = document.getElementById("heroBtnFantasy");
    if (heroBtnFantasy) {
        heroBtnFantasy.addEventListener("click", (e) => {
            e.preventDefault();
            openFantasyPortal();
        });
    }

    const userOpenFantasyBtn = document.getElementById("userOpenFantasyBtn");
    if (userOpenFantasyBtn) {
        userOpenFantasyBtn.addEventListener("click", () => {
            // Close profile dropdown
            const profileMenu = document.getElementById("userProfileMenu");
            if (profileMenu) profileMenu.style.display = "none";
            openFantasyPortal();
        });
    }

    const backBtn = document.getElementById("fantasyBackBtn");
    if (backBtn) {
        backBtn.addEventListener("click", () => {
            closeFantasyPortal();
        });
    }

    // Intercept other nav links to cleanly exit fantasy view if clicked
    document.querySelectorAll(".nav-links a:not(#navFantasy)").forEach(link => {
        link.addEventListener("click", (e) => {
            const fantasyView = document.getElementById("fantasyView");
            if (fantasyView && fantasyView.style.display !== "none") {
                const href = link.getAttribute("href");
                closeFantasyPortal(href);
            }
        });
    });

    const brandLogo = document.querySelector(".brand");
    if (brandLogo) {
        brandLogo.addEventListener("click", () => {
            const fantasyView = document.getElementById("fantasyView");
            if (fantasyView && fantasyView.style.display !== "none") {
                closeFantasyPortal("#home");
            }
        });
    }

    // 2. Subtabs Navigation Listeners
    const subTabTeam = document.getElementById("tabBtnFantasyTeam");
    const subTabMarket = document.getElementById("tabBtnFantasyMarket");
    const subTabLb = document.getElementById("tabBtnFantasyLeaderboard");
    const subTabRules = document.getElementById("tabBtnFantasyRules");

    if (subTabTeam) subTabTeam.addEventListener("click", () => switchFantasySubTab("team"));
    if (subTabMarket) subTabMarket.addEventListener("click", () => switchFantasySubTab("market"));
    if (subTabLb) subTabLb.addEventListener("click", () => switchFantasySubTab("leaderboard"));
    if (subTabRules) subTabRules.addEventListener("click", () => switchFantasySubTab("rules"));

    const goToMarketBtn = document.getElementById("fantasyGoToMarketBtn");
    if (goToMarketBtn) {
        goToMarketBtn.addEventListener("click", () => {
            setMarketFilter("all");
            switchFantasySubTab("market");
        });
    }

    // 3. Team Name Save and Reset Buttons
    const saveNameBtn = document.getElementById("fantasySaveTeamNameBtn");
    const teamNameInput = document.getElementById("fantasyTeamNameInput");
    const saveHint = document.getElementById("fantasySaveHint");

    const saveTeamName = () => {
        if (!requireFantasyAuth()) return;
        if (!teamNameInput) return;
        const val = teamNameInput.value.trim();
        if (val) {
            ffcFantasyState.teamName = val;
            saveFantasyTeamToStorage();
            if (saveHint) {
                saveHint.textContent = "✓ ¡Nombre guardado en tu perfil!";
                saveHint.style.color = "#4ade80";
                setTimeout(() => {
                    const u = getFantasyCurrentUser();
                    saveHint.textContent = u ? `Manager: ${u.displayName || u.email.split('@')[0]} · Sincronizado en la nube` : "Sincronizado con tu perfil";
                    saveHint.style.color = "#6b7280";
                }, 2500);
            }
        }
    };

    if (saveNameBtn) saveNameBtn.addEventListener("click", saveTeamName);
    if (teamNameInput) {
        teamNameInput.addEventListener("keydown", (e) => {
            if (e.key === "Enter") {
                e.preventDefault();
                saveTeamName();
            }
        });
        teamNameInput.addEventListener("blur", saveTeamName);
        teamNameInput.addEventListener("change", saveTeamName);
    }

    const resetBtn = document.getElementById("fantasyResetTeamBtn");
    if (resetBtn) {
        resetBtn.addEventListener("click", () => {
            if (isFantasyMarketLocked()) {
                handleLockedAction();
                return;
            }
            if (!requireFantasyAuth()) return;
            if (confirm("¿Estás seguro de que deseas reiniciar tu escudería y vender todos tus pilotos y constructor para recuperar los 75.0M€?")) {
                ffcFantasyState.driver1 = null;
                ffcFantasyState.driver2 = null;
                ffcFantasyState.driver3 = null;
                ffcFantasyState.team = null;
                ffcFantasyState.turboDriver = null;
                saveFantasyTeamToStorage();
                renderFantasyHUD();
                renderFantasySlots();
                if (ffcFantasyState.activeSubTab === "market") {
                    renderFantasyMarketGrid();
                }
            }
        });
    }

    // Login Prompt Banner Button
    const loginPromptBtn = document.getElementById("fantasyLoginPromptBtn");
    if (loginPromptBtn) {
        loginPromptBtn.addEventListener("click", () => {
            if (typeof openUserAuthModal === "function") {
                openUserAuthModal("login");
            }
        });
    }

    // 4. Market Filter Pills
    document.querySelectorAll(".market-filter-pill").forEach(pill => {
        pill.addEventListener("click", () => {
            const filter = pill.getAttribute("data-filter");
            setMarketFilter(filter);
        });
    });

    // 5. Market Search and Sort Controls
    const searchInput = document.getElementById("marketSearchInput");
    if (searchInput) {
        searchInput.addEventListener("input", (e) => {
            ffcFantasyState.searchQuery = e.target.value;
            renderFantasyMarketGrid();
        });
    }

    const sortSelect = document.getElementById("marketSortSelect");
    if (sortSelect) {
        sortSelect.addEventListener("change", (e) => {
            ffcFantasyState.sortBy = e.target.value;
            renderFantasyMarketGrid();
        });
    }

    // 6. Check Initial Hash on Page Load
    if (window.location.hash === "#fantasy") {
        openFantasyPortal();
    }

    window.addEventListener("hashchange", () => {
        if (window.location.hash === "#fantasy") {
            openFantasyPortal();
        } else {
            const fantasyView = document.getElementById("fantasyView");
            if (fantasyView && fantasyView.style.display !== "none") {
                closeFantasyPortal(window.location.hash);
            }
        }
    });

    // Initial render
    renderFantasyHUD();
    renderFantasySlots();
}

// Initialize on DOMContentLoaded or immediately if already loaded
if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", initFantasyLeague);
} else {
    initFantasyLeague();
}

/* =========================================================
   DRIVER COMPARATOR ENGINE (HEAD-TO-HEAD DUEL ANALYZER)
   Analizador y Comparador cara a cara de pilotos FFC
========================================================= */

let compareDriverA = null;
let compareDriverB = null;
compareMode = "mutual"; // "mutual" (Fair H2H - only shared races) or "all" (Full season)

// Switch between Fair (Mutual) and Full Season modes
function setComparatorMode(mode) {
    if (mode !== "mutual" && mode !== "all") return;
    compareMode = mode;

    const btnMutual = document.getElementById("btnCompareModeMutual");
    const btnAll = document.getElementById("btnCompareModeAll");
    const hintText = document.getElementById("compareModeInfoText");
    const hintIcon = document.getElementById("modeInfoIcon");

    if (btnMutual) {
        if (mode === "mutual") btnMutual.classList.add("is-active");
        else btnMutual.classList.remove("is-active");
    }

    if (btnAll) {
        if (mode === "all") btnAll.classList.add("is-active");
        else btnAll.classList.remove("is-active");
    }

    if (hintText && hintIcon) {
        const isEn = typeof currentLanguage !== "undefined" && currentLanguage === "en";
        if (mode === "mutual") {
            hintIcon.textContent = "⚖️";
            hintText.innerHTML = isEn
                ? "<strong>Fair Mode Active:</strong> Evaluating only Grands Prix where both drivers started on track. Absences do not award duel wins to the opponent."
                : "<strong>Modo Justo activo:</strong> Se analizan exclusivamente las carreras donde ambos compitieron en pista. Las ausencias no otorgan victorias al rival.";
        } else {
            hintIcon.textContent = "🌐";
            hintText.innerHTML = isEn
                ? "<strong>Full Season Mode:</strong> Evaluating all 15 rounds of the championship (non-participation counts as an adverse result)."
                : "<strong>Modo Temporada Completa:</strong> Se evalúan las 15 rondas del campeonato (la no participación cuenta como resultado adverso).";
        }
    }

    if (compareDriverA && compareDriverB) {
        renderDriverComparison(compareDriverA, compareDriverB);
    }
}

// Get sorted list of all active drivers for comparator dropdowns
function getComparatorDriversList() {
    let list = [];
    if (typeof currentPilotos !== "undefined" && Array.isArray(currentPilotos) && currentPilotos.length > 0) {
        list = currentPilotos;
    } else if (typeof getSavedStandings === "function") {
        list = getSavedStandings();
    } else if (typeof ffc2010SeasonDrivers !== "undefined" && Array.isArray(ffc2010SeasonDrivers)) {
        list = ffc2010SeasonDrivers;
    }

    const sorted = typeof sortDriversStandings === "function" ? sortDriversStandings(list) : list;
    return sorted.filter(d => d && d.driver);
}

// Open the Driver Comparison Modal
function openDriverComparison(driverNameA, driverNameB) {
    const overlay = document.getElementById("driverCompareOverlay");
    if (!overlay) return;

    const allDrivers = getComparatorDriversList();
    if (allDrivers.length === 0) return;

    // Determine initial drivers to compare
    if (driverNameA) {
        compareDriverA = driverNameA;
    } else if (!compareDriverA) {
        compareDriverA = allDrivers[0] ? allDrivers[0].driver : "Dieguiosk";
    }

    if (driverNameB) {
        compareDriverB = driverNameB;
    } else if (!compareDriverB || compareDriverB === compareDriverA) {
        // Pick the 2nd driver or another rival
        const rival = allDrivers.find(d => d.driver !== compareDriverA);
        compareDriverB = rival ? rival.driver : (allDrivers[1] ? allDrivers[1].driver : "Hermesalo");
    }

    // Populate the dropdown selectors
    populateComparatorDropdowns(allDrivers);

    // Render the matchup
    renderDriverComparison(compareDriverA, compareDriverB);

    // Show modal
    overlay.classList.add("is-active");
    overlay.setAttribute("aria-hidden", "false");
    document.body.style.overflow = "hidden";
}

// Close the Driver Comparison Modal
function closeDriverComparison() {
    const overlay = document.getElementById("driverCompareOverlay");
    if (overlay) {
        overlay.classList.remove("is-active");
        overlay.setAttribute("aria-hidden", "true");
    }
    document.body.style.overflow = "";
}

// Populate driver options in the A & B selector elements
function populateComparatorDropdowns(allDrivers) {
    const selectA = document.getElementById("compareSelectDriverA");
    const selectB = document.getElementById("compareSelectDriverB");
    if (!selectA || !selectB) return;

    const optionsHtml = allDrivers.map((d, index) => {
        const flag = (typeof getOfficialDriverFlag === "function") ? getOfficialDriverFlag(d.driver) : (d.flag || "🏁");
        const pos = d.pos || (index + 1);
        const pts = d.pts || 0;
        const team = d.team || "FFC";
        return `<option value="${escapeHTML(d.driver)}">${flag} P${pos} · ${escapeHTML(d.driver)} (${team} - ${pts} pts)</option>`;
    }).join("");

    selectA.innerHTML = optionsHtml;
    selectB.innerHTML = optionsHtml;

    if (compareDriverA) selectA.value = compareDriverA;
    if (compareDriverB) selectB.value = compareDriverB;
}

// Render dynamic quick preset buttons
function renderComparatorPresets(allDrivers) {
    const presetsContainer = document.getElementById("comparePresetsList");
    if (!presetsContainer) return;

    const presets = [];

    // Preset 1: P1 vs P2 (Title Fight)
    if (allDrivers.length >= 2) {
        presets.push({
            label: `🏆 ${allDrivers[0].driver} vs ${allDrivers[1].driver}`,
            driverA: allDrivers[0].driver,
            driverB: allDrivers[1].driver
        });
    }

    // Preset 2: Teammate Battles
    const teamGroups = {};
    allDrivers.forEach(d => {
        if (!teamGroups[d.team]) teamGroups[d.team] = [];
        teamGroups[d.team].push(d);
    });

    Object.keys(teamGroups).forEach(team => {
        if (teamGroups[team].length >= 2 && presets.length < 4) {
            presets.push({
                label: `⚔️ Duelo ${team} (${teamGroups[team][0].driver} vs ${teamGroups[team][1].driver})`,
                driverA: teamGroups[team][0].driver,
                driverB: teamGroups[team][1].driver
            });
        }
    });

    // Preset 3: Spanish / Iberian rivalry if available
    const spanishDrivers = allDrivers.filter(d => {
        const flag = typeof getOfficialDriverFlag === "function" ? getOfficialDriverFlag(d.driver) : d.flag;
        return flag === "🇪🇸" || flag === "🇵🇹";
    });
    if (spanishDrivers.length >= 2 && presets.length < 5) {
        const alreadyAdded = presets.some(p => p.driverA === spanishDrivers[0].driver && p.driverB === spanishDrivers[1].driver);
        if (!alreadyAdded) {
            presets.push({
                label: `🇪🇸 ${spanishDrivers[0].driver} vs ${spanishDrivers[1].driver}`,
                driverA: spanishDrivers[0].driver,
                driverB: spanishDrivers[1].driver
            });
        }
    }

    presetsContainer.innerHTML = presets.map(p => `
        <button type="button" class="compare-preset-chip" onclick="if(window.renderDriverComparison){window.renderDriverComparison('${escapeHTML(p.driverA)}', '${escapeHTML(p.driverB)}');}">
            ${p.label}
        </button>
    `).join("");
}

// Helper to normalize and compute driver statistics for the comparator
function normalizeComparatorStats(raw) {
    if (!raw) return null;
    const s = raw.stats || {};
    const wins = s.wins !== undefined ? s.wins : 0;
    const podiums = s.podiums !== undefined ? s.podiums : 0;
    const poles = s.poles !== undefined ? s.poles : 0;
    const fastestLaps = s.fastestLaps !== undefined ? s.fastestLaps : 0;
    const racesCount = s.races !== undefined ? s.races : 0;
    const dnfCount = s.dnfs !== undefined ? s.dnfs : 0;
    let top10s = 0;

    if (Array.isArray(raw.rounds)) {
        raw.rounds.forEach(val => {
            if (!val || val === "--" || val === "OUT" || val === "DSQ") return;
            const numStr = String(val).replace(/[\(\)\*]/g, "");
            const pts = parseInt(numStr, 10);
            if (!isNaN(pts) && pts > 0) {
                top10s++;
            }
        });
    }

    return {
        ...raw,
        wins,
        podiums,
        poles,
        fastestLaps,
        racesCount: Math.max(racesCount, 1),
        dnfCount,
        top10s
    };
}

// Full Render of Driver Comparison View
function renderDriverComparison(driverNameA, driverNameB) {
    if (!driverNameA || !driverNameB) return;
    compareDriverA = driverNameA;
    compareDriverB = driverNameB;

    const selectA = document.getElementById("compareSelectDriverA");
    const selectB = document.getElementById("compareSelectDriverB");
    if (selectA) selectA.value = compareDriverA;
    if (selectB) selectB.value = compareDriverB;

    // Update flag icons in selectors
    const flagA = (typeof getOfficialDriverFlag === "function") ? getOfficialDriverFlag(compareDriverA) : "🏁";
    const flagB = (typeof getOfficialDriverFlag === "function") ? getOfficialDriverFlag(compareDriverB) : "🏁";
    const flagElA = document.getElementById("compareSelectFlagA");
    const flagElB = document.getElementById("compareSelectFlagB");
    if (flagElA) flagElA.textContent = flagA;
    if (flagElB) flagElB.textContent = flagB;

    // Fetch Stats using existing rich statistical aggregator
    const rawStatsA = (typeof findDriverStats === "function") ? findDriverStats(compareDriverA) : null;
    const rawStatsB = (typeof findDriverStats === "function") ? findDriverStats(compareDriverB) : null;

    if (!rawStatsA || !rawStatsB) return;

    const statsA = normalizeComparatorStats(rawStatsA);
    const statsB = normalizeComparatorStats(rawStatsB);

    // Fetch Fantasy Market Prices & Fluctuations
    const fantasyPriceA = (typeof getDriverFantasyPrice === "function") ? getDriverFantasyPrice(compareDriverA) : 15.0;
    const fantasyPriceB = (typeof getDriverFantasyPrice === "function") ? getDriverFantasyPrice(compareDriverB) : 15.0;

    // 1. Render Driver A Profile Card
    renderComparatorHeroCard("A", statsA, fantasyPriceA);

    // 2. Render Driver B Profile Card
    renderComparatorHeroCard("B", statsB, fantasyPriceB);

    // 3. Compute Head-to-Head Direct GP Duel Score
    const h2hResult = computeDriverHeadToHeadDuels(statsA, statsB, compareMode);
    renderComparatorScoreboard(h2hResult, statsA, statsB);

    // 4. Render Comparative Metric Rows & Balance Bars
    renderComparatorMetricsGrid(statsA, statsB, fantasyPriceA, fantasyPriceB, h2hResult);

    // 5. Render Driver Performance & Skills Radar Indicators
    renderComparatorSkillsGrid(statsA, statsB);

    // 6. Render Round-by-Round Breakdown Matrix (R1 - R15)
    renderComparatorRoundsTable(statsA, statsB, h2hResult);

    // 7. Update Presets
    const allDrivers = getComparatorDriversList();
    renderComparatorPresets(allDrivers);
}

// Render individual Hero Profile Card
function renderComparatorHeroCard(slot, stats, fantasyPrice) {
    const prefix = slot; // "A" or "B"
    const nameEl = document.getElementById(`compareName${prefix}`);
    const flagEl = document.getElementById(`compareFlag${prefix}`);
    const teamEl = document.getElementById(`compareTeam${prefix}`);
    const posEl = document.getElementById(`comparePos${prefix}`);
    const priceEl = document.getElementById(`comparePrice${prefix}`);
    const dorsalEl = document.getElementById(`compareDorsal${prefix}`);
    const avatarNumEl = document.getElementById(`compareAvatarNum${prefix}`);
    const verifiedEl = document.getElementById(`compareVerified${prefix}`);

    const driverName = stats.driver;
    const flag = (typeof getOfficialDriverFlag === "function") ? getOfficialDriverFlag(driverName) : (stats.flag || "🏁");
    const dorsal = (typeof getDriverDorsalNumber === "function") ? getDriverDorsalNumber(driverName) : (stats.dorsal || "#" + (stats.pos || 1));

    if (nameEl) nameEl.textContent = driverName;
    if (flagEl) flagEl.innerHTML = getFlagHtml(flag, 20);
    if (teamEl) {
        teamEl.textContent = stats.team || "FFC";
        const teamClass = (typeof getTeamClass === "function") ? getTeamClass(stats.team) : "team-hrt";
        teamEl.className = `compare-team-pill ${teamClass}`;
    }
    if (posEl) posEl.textContent = `P${stats.pos || 1} · ${stats.pts || 0} PTS (${stats.racesCount || 1} GPs)`;
    if (priceEl) priceEl.textContent = `${fantasyPrice.toFixed(1)}M€`;
    if (dorsalEl) dorsalEl.textContent = dorsal;
    if (avatarNumEl) avatarNumEl.textContent = dorsal.replace("#", "");
    if (verifiedEl) {
        const isVer = (typeof isDriverAccountVerified === "function") ? isDriverAccountVerified(driverName) : false;
        verifiedEl.style.display = isVer ? "inline-block" : "none";
    }
}

// Helper to calculate race points for a driver entry in a given GP
function calculateRaceDriverPoints(driverEntry, raceObj, cleanDriverKey) {
    if (!driverEntry) return 0;
    if (typeof driverEntry.pts === "number" && !isNaN(driverEntry.pts)) {
        return driverEntry.pts;
    }
    if (typeof driverEntry.pts === "string" && driverEntry.pts.trim() !== "" && !isNaN(Number(driverEntry.pts))) {
        return Number(driverEntry.pts);
    }
    const status = String(driverEntry.status || "").trim().toUpperCase();
    if (status === "DSQ" || status === "DNS" || status === "NC" || status === "AUSENTE" || status === "NO_SHOW") {
        return 0;
    }
    const posRaw = driverEntry.pos;
    if (isDriverDnfStatus(posRaw) || status === "DNF") {
        return 0;
    }
    const posNum = parseInt(posRaw, 10);
    if (isNaN(posNum) || posNum < 1 || posNum > 10) {
        return 0;
    }

    let pts = (typeof F1_POINTS_MAP !== "undefined" && F1_POINTS_MAP[posNum]) ? F1_POINTS_MAP[posNum] : 0;

    // Check if this driver scored fastest lap in this GP (+1 bonus point)
    if (raceObj && raceObj.fastest && raceObj.fastest !== "TBA" && cleanDriverKey) {
        const flName = raceObj.fastest.split("·")[0].trim();
        const flKey = typeof normalizeDriverKey === "function" ? normalizeDriverKey(flName) : flName.trim().toLowerCase();
        if (flKey === cleanDriverKey) {
            pts += (typeof F1_FASTEST_LAP_PTS !== "undefined" ? F1_FASTEST_LAP_PTS : 1);
        }
    }
    return pts;
}

// Calculate Head-to-Head direct duels across all 15 GPs (Supports Fair Mutual Mode and Full Season)
function computeDriverHeadToHeadDuels(statsA, statsB, mode = "mutual") {
    const list = (typeof FFC_SEASON_GPS !== "undefined" && Array.isArray(FFC_SEASON_GPS)) ? FFC_SEASON_GPS : [];
    const rMap = (typeof raceResults !== "undefined" && raceResults) ? raceResults : {};

    let scoreA = 0;
    let scoreB = 0;
    let ties = 0;
    let mutualRoundsCount = 0;
    let totalCompletedRounds = 0;
    let mutualPtsA = 0;
    let mutualPtsB = 0;
    const roundDuels = [];

    const nameA = (statsA && statsA.driver) ? statsA.driver : "";
    const nameB = (statsB && statsB.driver) ? statsB.driver : "";
    const cleanA = typeof normalizeDriverKey === "function" ? normalizeDriverKey(nameA) : nameA.trim().toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
    const cleanB = typeof normalizeDriverKey === "function" ? normalizeDriverKey(nameB) : nameB.trim().toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");

    list.forEach((gp, index) => {
        const roundNum = index + 1;
        const res = rMap[gp.raceKey];
        const isCompleted = res && (res.status === "COMPLETED" || (res.winner && res.winner !== "TBA" && Array.isArray(res.drivers) && res.drivers.length > 0));
        if (isCompleted) totalCompletedRounds++;

        let rawA = null;
        let rawB = null;

        if (res && Array.isArray(res.drivers)) {
            rawA = res.drivers.find(d => {
                if (!d) return false;
                const dName = d.driver || d.name || "";
                const dClean = typeof normalizeDriverKey === "function" ? normalizeDriverKey(dName) : dName.trim().toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
                return dClean === cleanA;
            });
            rawB = res.drivers.find(d => {
                if (!d) return false;
                const dName = d.driver || d.name || "";
                const dClean = typeof normalizeDriverKey === "function" ? normalizeDriverKey(dName) : dName.trim().toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
                return dClean === cleanB;
            });
        }

        const bothParticipated = Boolean(isCompleted && rawA && rawB);
        if (bothParticipated) {
            mutualRoundsCount++;
        }

        // Determine Pole & Fastest Lap for each driver in this GP
        let poleA = false;
        let vrA = false;
        let poleB = false;
        let vrB = false;

        if (res && res.pole && res.pole !== "TBA") {
            const poleDriver = res.pole.split("·")[0].trim();
            const poleKey = typeof normalizeDriverKey === "function" ? normalizeDriverKey(poleDriver) : poleDriver.toLowerCase();
            if (poleKey === cleanA) poleA = true;
            if (poleKey === cleanB) poleB = true;
        }
        if (res && res.fastest && res.fastest !== "TBA") {
            const vrDriver = res.fastest.split("·")[0].trim();
            const vrKey = typeof normalizeDriverKey === "function" ? normalizeDriverKey(vrDriver) : vrDriver.toLowerCase();
            if (vrKey === cleanA) vrA = true;
            if (vrKey === cleanB) vrB = true;
        }

        const ptsA = rawA ? calculateRaceDriverPoints(rawA, res, cleanA) : 0;
        const ptsB = rawB ? calculateRaceDriverPoints(rawB, res, cleanB) : 0;
        const ptsDiff = ptsA - ptsB;

        if (bothParticipated) {
            mutualPtsA += ptsA;
            mutualPtsB += ptsB;
        }

        const resA = rawA ? { ...rawA, pts: ptsA, pole: poleA, vr: vrA } : null;
        const resB = rawB ? { ...rawB, pts: ptsB, pole: poleB, vr: vrB } : null;

        let winner = null; // "A", "B", "TIE", or "NON_MUTUAL" / null

        if (isCompleted) {
            if (bothParticipated) {
                // Both raced: compute direct head-to-head finish
                const posA = rawA.pos;
                const posB = rawB.pos;

                const isDnfA = isDriverDnfStatus(posA) || (rawA.status && String(rawA.status).toUpperCase() === "DNF");
                const isDnfB = isDriverDnfStatus(posB) || (rawB.status && String(rawB.status).toUpperCase() === "DNF");

                if (!isDnfA && isDnfB) {
                    winner = "A";
                    scoreA++;
                } else if (isDnfA && !isDnfB) {
                    winner = "B";
                    scoreB++;
                } else if (!isDnfA && !isDnfB) {
                    const numA = parseInt(posA, 10) || 99;
                    const numB = parseInt(posB, 10) || 99;
                    if (numA < numB) {
                        winner = "A";
                        scoreA++;
                    } else if (numB < numA) {
                        winner = "B";
                        scoreB++;
                    } else {
                        if (ptsA > ptsB) {
                            winner = "A";
                            scoreA++;
                        } else if (ptsB > ptsA) {
                            winner = "B";
                            scoreB++;
                        } else {
                            winner = "TIE";
                            ties++;
                        }
                    }
                } else {
                    // Both DNF
                    if (ptsA > ptsB) {
                        winner = "A";
                        scoreA++;
                    } else if (ptsB > ptsA) {
                        winner = "B";
                        scoreB++;
                    } else {
                        winner = "TIE";
                        ties++;
                    }
                }
            } else if (rawA || rawB) {
                // Only one of them raced in this GP
                if (mode === "all") {
                    if (rawA && !rawB) {
                        winner = "A";
                        scoreA++;
                    } else if (!rawA && rawB) {
                        winner = "B";
                        scoreB++;
                    }
                } else {
                    // In Fair Mutual Mode, absence is treated as neutral (no duel victory awarded)
                    winner = "NON_MUTUAL";
                }
            }
        }

        roundDuels.push({
            roundNum,
            gpName: gp.name || gp.code || `Round ${roundNum}`,
            flag: gp.flag || (gp.country ? (typeof getOfficialCountryFlag === "function" ? getOfficialCountryFlag(gp.country) : "🏁") : "🏁"),
            country: gp.country || gp.name,
            raceKey: gp.raceKey,
            isCompleted,
            bothParticipated,
            resA,
            resB,
            ptsA,
            ptsB,
            ptsDiff,
            winner
        });
    });

    return {
        scoreA,
        scoreB,
        ties,
        mutualRoundsCount,
        totalCompletedRounds,
        mutualPtsA,
        mutualPtsB,
        mode,
        roundDuels
    };
}

// Helper to check DNF / DNS / NC status
function isDriverDnfStatus(pos) {
    if (!pos) return true;
    const p = String(pos).trim().toUpperCase();
    return p === "DNF" || p === "DNS" || p === "DSQ" || p === "NC" || p === "RET" || p === "AUSENTE";
}

// Render the duel scoreboard
function renderComparatorScoreboard(h2h, statsA, statsB) {
    const scoreAEl = document.getElementById("h2hScoreA");
    const scoreBEl = document.getElementById("h2hScoreB");
    const leaderTagEl = document.getElementById("h2hLeaderTag");
    const verdictSubEl = document.getElementById("lblH2HVerdictSub");
    const mutualBadgeEl = document.getElementById("compareMutualCountBadge");

    if (mutualBadgeEl) {
        mutualBadgeEl.textContent = `${h2h.mutualRoundsCount} GPs juntos`;
    }

    if (!scoreAEl || !scoreBEl || !leaderTagEl) return;

    scoreAEl.textContent = h2h.scoreA;
    scoreBEl.textContent = h2h.scoreB;

    const isEn = typeof currentLanguage !== "undefined" && currentLanguage === "en";

    // Update scoreboard subtext based on active mode
    if (verdictSubEl) {
        if (h2h.mode === "mutual") {
            if (h2h.mutualRoundsCount === 0) {
                verdictSubEl.textContent = isEn ? "No mutual races completed together yet" : "Sin carreras coincidentes disputadas todavía";
            } else {
                verdictSubEl.textContent = isEn
                    ? `Direct on-track duel in ${h2h.mutualRoundsCount} shared Grands Prix`
                    : `Duelo directo en las ${h2h.mutualRoundsCount} carreras donde ambos participaron`;
            }
        } else {
            verdictSubEl.textContent = isEn
                ? `Global duel across full season (${h2h.totalCompletedRounds} completed GPs)`
                : `Duelo global sobre el calendario completo (${h2h.totalCompletedRounds} carreras)`;
        }
    }

    if (h2h.mode === "mutual" && h2h.mutualRoundsCount === 0) {
        leaderTagEl.innerHTML = isEn ? "⚖️ NO MUTUAL RACES (0 SHARED GPS)" : "⚖️ SIN ENFRENTAMIENTOS DIRECTOS (0 GPs juntos)";
        leaderTagEl.style.color = "#94a3b8";
        leaderTagEl.style.borderColor = "rgba(255, 255, 255, 0.15)";
        leaderTagEl.style.background = "rgba(255, 255, 255, 0.05)";
    } else if (h2h.scoreA > h2h.scoreB) {
        const diff = h2h.scoreA - h2h.scoreB;
        leaderTagEl.innerHTML = `🏆 <strong>${escapeHTML(statsA.driver.toUpperCase())}</strong> ${isEn ? "LEADS DUEL" : "LIDERA EL DUELO"} (+${diff})`;
        leaderTagEl.style.color = "#f87171";
        leaderTagEl.style.borderColor = "rgba(239, 68, 68, 0.4)";
        leaderTagEl.style.background = "rgba(239, 68, 68, 0.15)";
    } else if (h2h.scoreB > h2h.scoreA) {
        const diff = h2h.scoreB - h2h.scoreA;
        leaderTagEl.innerHTML = `🏆 <strong>${escapeHTML(statsB.driver.toUpperCase())}</strong> ${isEn ? "LEADS DUEL" : "LIDERA EL DUELO"} (+${diff})`;
        leaderTagEl.style.color = "#60a5fa";
        leaderTagEl.style.borderColor = "rgba(59, 130, 246, 0.4)";
        leaderTagEl.style.background = "rgba(59, 130, 246, 0.15)";
    } else {
        leaderTagEl.innerHTML = `⚖️ ${isEn ? "TIED DUEL" : "DUELO EMPATADO"} (${h2h.scoreA} - ${h2h.scoreB})`;
        leaderTagEl.style.color = "#fce79a";
        leaderTagEl.style.borderColor = "rgba(214, 180, 92, 0.3)";
        leaderTagEl.style.background = "rgba(214, 180, 92, 0.12)";
    }
}

function getComparatorDict() {
    const t = typeof translations !== "undefined" ? translations : null;
    const lang = typeof currentLanguage !== "undefined" ? currentLanguage : "es";
    if (t && t[lang]) {
        if (t[lang].compare) return t[lang].compare;
        if (t[lang].news && t[lang].news.compare) return t[lang].news.compare;
    }
    if (t && t.es) {
        if (t.es.compare) return t.es.compare;
        if (t.es.news && t.es.news.compare) return t.es.news.compare;
    }
    return {
        metrics: {},
        skills: {},
        tie: "Empate",
        noMatch: "Sin coincidencia",
        noMatchTitle: "Solo uno participó: no suma victoria en Modo Justo",
        didNotParticipate: "NO PARTICIPÓ"
    };
}

// Render Comparative Metrics with relative interactive balance bars (Fair Mode support)
function renderComparatorMetricsGrid(statsA, statsB, priceA, priceB, h2h) {
    const grid = document.getElementById("compareMetricsGrid");
    if (!grid) return;

    const cmpDict = getComparatorDict();
    const mKeys = cmpDict.metrics || {};

    // Derived normalized metrics
    const racesA = statsA.racesCount || 1;
    const racesB = statsB.racesCount || 1;

    const avgPtsA = (statsA.pts / Math.max(racesA, 1)).toFixed(1);
    const avgPtsB = (statsB.pts / Math.max(racesB, 1)).toFixed(1);

    const winRateA = Math.round((statsA.wins / racesA) * 100);
    const winRateB = Math.round((statsB.wins / racesB) * 100);

    const podiumRateA = Math.round((statsA.podiums / racesA) * 100);
    const podiumRateB = Math.round((statsB.podiums / racesB) * 100);

    const relA = (statsA.racesCount > 0) ? Math.round(((statsA.racesCount - (statsA.dnfCount || 0)) / statsA.racesCount) * 100) : 0;
    const relB = (statsB.racesCount > 0) ? Math.round(((statsB.racesCount - (statsB.dnfCount || 0)) / statsB.racesCount) * 100) : 0;

    const isMutualMode = h2h && h2h.mode === "mutual";

    const metrics = [
        {
            name: mKeys.avgPts || "PROMEDIO PTS / GP",
            valA: parseFloat(avgPtsA),
            valB: parseFloat(avgPtsB),
            dispA: `${avgPtsA} pts / GP`,
            dispB: `${avgPtsB} pts / GP`,
            higherIsBetter: true
        },
        ...(isMutualMode && h2h.mutualRoundsCount > 0 ? [{
            name: `${mKeys.mutualPts || "PUNTOS EN DUELOS DIRECTOS"} (${h2h.mutualRoundsCount} GPs)`,
            valA: h2h.mutualPtsA,
            valB: h2h.mutualPtsB,
            dispA: `${h2h.mutualPtsA} pts`,
            dispB: `${h2h.mutualPtsB} pts`,
            higherIsBetter: true
        }] : []),
        {
            name: mKeys.podiumEff || "EFECTIVIDAD EN PODIOS",
            valA: podiumRateA,
            valB: podiumRateB,
            dispA: `${statsA.podiums} de ${racesA} (${podiumRateA}%)`,
            dispB: `${statsB.podiums} de ${racesB} (${podiumRateB}%)`,
            higherIsBetter: true
        },
        {
            name: mKeys.winEff || "EFECTIVIDAD EN VICTORIAS",
            valA: winRateA,
            valB: winRateB,
            dispA: `${statsA.wins} de ${racesA} (${winRateA}%)`,
            dispB: `${statsB.wins} de ${racesB} (${winRateB}%)`,
            higherIsBetter: true
        },
        {
            name: mKeys.racesEntered || "CARRERAS DISPUTADAS",
            valA: racesA,
            valB: racesB,
            dispA: `${racesA} GPs`,
            dispB: `${racesB} GPs`,
            higherIsBetter: true
        },
        {
            name: mKeys.totalPts || "PUNTOS TOTALES",
            valA: statsA.pts,
            valB: statsB.pts,
            dispA: `${statsA.pts} pts`,
            dispB: `${statsB.pts} pts`,
            higherIsBetter: true
        },
        {
            name: mKeys.champPos || "POSICIÓN EN EL MUNDIAL",
            valA: statsA.pos,
            valB: statsB.pos,
            dispA: `P${statsA.pos}`,
            dispB: `P${statsB.pos}`,
            higherIsBetter: false // Lower position number is better
        },
        {
            name: mKeys.poles || "POLE POSITIONS",
            valA: statsA.poles,
            valB: statsB.poles,
            dispA: `${statsA.poles} poles`,
            dispB: `${statsB.poles} poles`,
            higherIsBetter: true
        },
        {
            name: mKeys.fastestLaps || "VUELTAS RÁPIDAS",
            valA: statsA.fastestLaps,
            valB: statsB.fastestLaps,
            dispA: `${statsA.fastestLaps} VR`,
            dispB: `${statsB.fastestLaps} VR`,
            higherIsBetter: true
        },
        {
            name: mKeys.reliability || "FIABILIDAD EN CARRERA",
            valA: relA,
            valB: relB,
            dispA: `${relA}% (${statsA.dnfCount || 0} DNF)`,
            dispB: `${relB}% (${statsB.dnfCount || 0} DNF)`,
            higherIsBetter: true
        },
        {
            name: mKeys.fantasyValue || "VALOR FANTASY FFC",
            valA: priceA,
            valB: priceB,
            dispA: `${priceA.toFixed(1)}M€`,
            dispB: `${priceB.toFixed(1)}M€`,
            higherIsBetter: true
        }
    ];

    grid.innerHTML = metrics.map(m => {
        let isWinnerA = false;
        let isWinnerB = false;

        if (m.higherIsBetter) {
            if (m.valA > m.valB) isWinnerA = true;
            else if (m.valB > m.valA) isWinnerB = true;
        } else {
            if (m.valA < m.valB) isWinnerA = true;
            else if (m.valB < m.valA) isWinnerB = true;
        }

        // Relative bar width calculation
        let barPctA = 50;
        let barPctB = 50;

        if (m.higherIsBetter) {
            const sum = (m.valA || 0) + (m.valB || 0);
            if (sum > 0) {
                barPctA = Math.max(12, Math.min(88, Math.round((m.valA / sum) * 100)));
                barPctB = 100 - barPctA;
            }
        } else {
            // For championship position, invert ratio
            const invA = 1 / Math.max(1, m.valA);
            const invB = 1 / Math.max(1, m.valB);
            const sum = invA + invB;
            if (sum > 0) {
                barPctA = Math.max(12, Math.min(88, Math.round((invA / sum) * 100)));
                barPctB = 100 - barPctA;
            }
        }

        return `
            <div class="compare-metric-row">
                <div class="compare-metric-header">
                    <div class="metric-val val-a ${isWinnerA ? 'is-winner' : ''}">
                        <span>${m.dispA}</span>
                    </div>
                    <div class="metric-name-wrap">
                        <span class="metric-name">${m.name}</span>
                    </div>
                    <div class="metric-val val-b ${isWinnerB ? 'is-winner' : ''}">
                        <span>${m.dispB}</span>
                    </div>
                </div>
                <div class="metric-bar-track">
                    <div class="metric-bar-a" style="width: ${barPctA}%;"></div>
                    <div class="metric-bar-divider"></div>
                    <div class="metric-bar-b" style="width: ${barPctB}%;"></div>
                </div>
            </div>
        `;
    }).join("");
}

// Render Skills / Performance normalized ratings (per-race basis)
function renderComparatorSkillsGrid(statsA, statsB) {
    const grid = document.getElementById("compareSkillsGrid");
    if (!grid) return;

    const cmpDict = getComparatorDict();
    const sKeys = cmpDict.skills || {};

    const racesA = Math.max(1, statsA.racesCount || 1);
    const racesB = Math.max(1, statsB.racesCount || 1);

    // 1. Race Pace / Ritmo en Carrera (Normalized per GP)
    const racePaceA = Math.min(99, Math.round((statsA.pts / (racesA * 25)) * 80 + ((statsA.wins / racesA) * 20) + ((statsA.podiums / racesA) * 10) + 15));
    const racePaceB = Math.min(99, Math.round((statsB.pts / (racesB * 25)) * 80 + ((statsB.wins / racesB) * 20) + ((statsB.podiums / racesB) * 10) + 15));

    // 2. Qualy Speed / Ritmo a Una Vuelta
    const qualySpeedA = Math.min(99, Math.round(50 + ((statsA.poles / racesA) * 45) + ((statsA.wins / racesA) * 15)));
    const qualySpeedB = Math.min(99, Math.round(50 + ((statsB.poles / racesB) * 45) + ((statsB.wins / racesB) * 15)));

    // 3. Reliability / Fiabilidad Mecánica
    const relScoreA = Math.max(15, Math.min(99, Math.round(((racesA - (statsA.dnfCount || 0)) / racesA) * 100)));
    const relScoreB = Math.max(15, Math.min(99, Math.round(((racesB - (statsB.dnfCount || 0)) / racesB) * 100)));

    // 4. Regularity / Consistencia en Puntos (Top 10 ratio)
    const regScoreA = Math.min(99, Math.round((statsA.top10s / racesA) * 85 + 15));
    const regScoreB = Math.min(99, Math.round((statsB.top10s / racesB) * 85 + 15));

    // 5. Podium Efficiency / Efectividad
    const podScoreA = Math.min(99, Math.round((statsA.podiums / racesA) * 90 + 10));
    const podScoreB = Math.min(99, Math.round((statsB.podiums / racesB) * 90 + 10));

    const skills = [
        { name: sKeys.racePace || "🏎️ RITMO DE CARRERA", scoreA: racePaceA, scoreB: racePaceB },
        { name: sKeys.qualyPace || "⏱️ RITMO DE CLASIFICACIÓN", scoreA: qualySpeedA, scoreB: qualySpeedB },
        { name: sKeys.reliability || "🛡️ FIABILIDAD MECÁNICA", scoreA: relScoreA, scoreB: relScoreB },
        { name: sKeys.consistency || "🎯 REGULARIDAD EN TOP 10", scoreA: regScoreA, scoreB: regScoreB },
        { name: sKeys.podiumEff || "🏆 EFECTIVIDAD EN PODIOS", scoreA: podScoreA, scoreB: podScoreB }
    ];

    grid.innerHTML = skills.map(s => `
        <div class="skill-card">
            <div class="skill-title-row">
                <span class="skill-name">${s.name}</span>
                <span class="skill-scores">
                    <span class="score-a">${s.scoreA}</span> vs <span class="score-b">${s.scoreB}</span>
                </span>
            </div>
            <div class="skill-bar-pair">
                <div class="skill-single-bar">
                    <div class="skill-fill-a" style="width: ${s.scoreA}%;"></div>
                </div>
                <div class="skill-single-bar">
                    <div class="skill-fill-b" style="width: ${s.scoreB}%;"></div>
                </div>
            </div>
        </div>
    `).join("");
}

// Render Round-by-Round GP Matrix Table with mutual awareness
function renderComparatorRoundsTable(statsA, statsB, h2h) {
    const tbody = document.getElementById("compareRoundsTableBody");
    const thA = document.getElementById("thRoundDriverA");
    const thB = document.getElementById("thRoundDriverB");
    if (!tbody) return;

    if (thA) thA.textContent = statsA.driver.toUpperCase();
    if (thB) thB.textContent = statsB.driver.toUpperCase();

    const cmpDict = getComparatorDict();

    const data = h2h || computeDriverHeadToHeadDuels(statsA, statsB, compareMode);

    tbody.innerHTML = data.roundDuels.map(d => {
        let duelBadge = `<span class="round-winner-chip" style="opacity: 0.4;">—</span>`;
        let isNonMutual = false;

        if (d.isCompleted) {
            if (d.winner === "A") {
                duelBadge = `<span class="round-winner-chip winner-a">🔴 ${escapeHTML(statsA.driver)}</span>`;
            } else if (d.winner === "B") {
                duelBadge = `<span class="round-winner-chip winner-b">🔵 ${escapeHTML(statsB.driver)}</span>`;
            } else if (d.winner === "TIE") {
                duelBadge = `<span class="round-winner-chip winner-tie">➖ ${cmpDict.tie || "Empate"}</span>`;
            } else if (d.winner === "NON_MUTUAL") {
                isNonMutual = true;
                duelBadge = `<span class="round-winner-chip chip-non-mutual" title="${escapeHTML(cmpDict.noMatchTitle || "Solo uno participó: no suma victoria en Modo Justo")}">⚪ ${cmpDict.noMatch || "Sin coincidencia"}</span>`;
            }
        }

        // Format Driver A Result Cell
        let dispA = `<span style="color: #64748b;">—</span>`;
        if (d.resA) {
            const poleTag = d.resA.pole ? ` <span title="Pole Position" style="color: #d6b45c;">⭕</span>` : "";
            const vrTag = d.resA.vr ? ` <span title="Vuelta Rápida" style="color: #a855f7;">⭐</span>` : "";
            const isWinnerA = d.winner === "A";
            dispA = `<span class="round-driver-val ${isWinnerA ? 'is-ahead' : ''}" style="${isWinnerA ? 'color: #fca5a5;' : 'color: #cbd5e1;'}">${escapeHTML(d.resA.pos)} (${d.ptsA} pts)${poleTag}${vrTag}</span>`;
        } else if (d.isCompleted) {
            dispA = `<span style="color: #64748b; font-size: 11px;">${cmpDict.didNotParticipate || "NO PARTICIPÓ"}</span>`;
        }

        // Format Driver B Result Cell
        let dispB = `<span style="color: #64748b;">—</span>`;
        if (d.resB) {
            const poleTag = d.resB.pole ? ` <span title="Pole Position" style="color: #d6b45c;">⭕</span>` : "";
            const vrTag = d.resB.vr ? ` <span title="Vuelta Rápida" style="color: #a855f7;">⭐</span>` : "";
            const isWinnerB = d.winner === "B";
            dispB = `<span class="round-driver-val ${isWinnerB ? 'is-ahead' : ''}" style="${isWinnerB ? 'color: #93c5fd;' : 'color: #cbd5e1;'}">${escapeHTML(d.resB.pos)} (${d.ptsB} pts)${poleTag}${vrTag}</span>`;
        } else if (d.isCompleted) {
            dispB = `<span style="color: #64748b; font-size: 11px;">${cmpDict.didNotParticipate || "NO PARTICIPÓ"}</span>`;
        }

        // Difference in Points
        let diffFormatted = `<span style="color: #64748b;">—</span>`;
        if (d.isCompleted) {
            if (d.ptsDiff > 0) {
                diffFormatted = `<span style="color: #f87171; font-weight: 800;">+${d.ptsDiff}</span>`;
            } else if (d.ptsDiff < 0) {
                diffFormatted = `<span style="color: #60a5fa; font-weight: 800;">${d.ptsDiff}</span>`;
            } else {
                diffFormatted = `<span style="color: #94a3b8;">0</span>`;
            }
        }

        return `
            <tr class="${isNonMutual ? 'is-non-mutual' : ''}">
                <td style="font-weight: 800; color: #94a3b8; font-family: 'Barlow Condensed', sans-serif;">R${d.roundNum}</td>
                <td>
                    <span style="margin-right: 6px;">${getFlagHtml(d.flag || "🏁", 16)}</span>
                    <strong style="color: #f1f5f9;">${escapeHTML(d.gpName)}</strong>
                </td>
                <td style="text-align: center;">${dispA}</td>
                <td style="text-align: center;">${duelBadge}</td>
                <td style="text-align: center;">${dispB}</td>
                <td style="text-align: right; font-family: 'Barlow Condensed', sans-serif;">${diffFormatted}</td>
            </tr>
        `;
    }).join("");
}

// Initialize Driver Comparator Events & Controls
function initDriverComparator() {
    const overlay = document.getElementById("driverCompareOverlay");
    const closeBtn = document.getElementById("closeDriverCompare");
    const swapBtn = document.getElementById("compareSwapBtn");
    const selectA = document.getElementById("compareSelectDriverA");
    const selectB = document.getElementById("compareSelectDriverB");
    const navCompare = document.getElementById("navCompare");
    const standingsCompareBtn = document.getElementById("btnStandingsCompare");
    const driverModalCompareBtn = document.getElementById("btnDriverModalCompareAction");
    const btnModeMutual = document.getElementById("btnCompareModeMutual");
    const btnModeAll = document.getElementById("btnCompareModeAll");

    // Close button
    if (closeBtn) {
        closeBtn.addEventListener("click", (e) => {
            e.preventDefault();
            closeDriverComparison();
        });
    }

    // Overlay backdrop click to close
    if (overlay) {
        overlay.addEventListener("click", (e) => {
            if (e.target === overlay) {
                closeDriverComparison();
            }
        });
    }

    // Escape key to close
    document.addEventListener("keydown", (e) => {
        if (e.key === "Escape" && overlay && overlay.classList.contains("is-active")) {
            closeDriverComparison();
        }
    });

    // Swap drivers button
    if (swapBtn) {
        swapBtn.addEventListener("click", () => {
            if (compareDriverA && compareDriverB) {
                const temp = compareDriverA;
                compareDriverA = compareDriverB;
                compareDriverB = temp;
                renderDriverComparison(compareDriverA, compareDriverB);
            }
        });
    }

    // Dropdown change listeners
    if (selectA) {
        selectA.addEventListener("change", (e) => {
            const val = e.target.value;
            if (val) {
                renderDriverComparison(val, compareDriverB);
            }
        });
    }

    if (selectB) {
        selectB.addEventListener("change", (e) => {
            const val = e.target.value;
            if (val) {
                renderDriverComparison(compareDriverA, val);
            }
        });
    }

    // Comparator Mode Toggle Buttons
    if (btnModeMutual) {
        btnModeMutual.addEventListener("click", () => {
            setComparatorMode("mutual");
        });
    }

    if (btnModeAll) {
        btnModeAll.addEventListener("click", () => {
            setComparatorMode("all");
        });
    }

    // Nav bar comparison trigger
    if (navCompare) {
        navCompare.addEventListener("click", (e) => {
            e.preventDefault();
            openDriverComparison();
        });
    }

    // Standings comparison trigger
    if (standingsCompareBtn) {
        standingsCompareBtn.addEventListener("click", (e) => {
            e.preventDefault();
            openDriverComparison();
        });
    }

    // Driver Modal comparison action trigger
    if (driverModalCompareBtn) {
        driverModalCompareBtn.addEventListener("click", () => {
            const currentDriver = typeof currentOpenModalDriver !== "undefined" ? currentOpenModalDriver : null;
            if (typeof closeDriverStatsModal === "function") {
                closeDriverStatsModal();
            }
            openDriverComparison(currentDriver, null);
        });
    }
}

// Attach globally and initialize Driver Comparator
window.openDriverComparison = openDriverComparison;
window.closeDriverComparison = closeDriverComparison;
window.renderDriverComparison = renderDriverComparison;
window.initDriverComparator = initDriverComparator;

// Initialize comparator on load
if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", initDriverComparator);
} else {
    initDriverComparator();
}


/* =========================================================
   PRIVACY POLICY MODAL HANDLER
========================================================= */
function initPrivacyModal() {
    const openBtn = document.getElementById("footerPrivacyBtn");
    const overlay = document.getElementById("privacyModalOverlay");
    const closeBtn = document.getElementById("privacyModalClose");
    const acceptBtn = document.getElementById("privacyModalAcceptBtn");

    if (!overlay) return;

    function openPrivacyModal() {
        overlay.style.display = "flex";
        overlay.setAttribute("aria-hidden", "false");
    }

    function closePrivacyModal() {
        overlay.style.display = "none";
        overlay.setAttribute("aria-hidden", "true");
    }

    if (openBtn) {
        openBtn.addEventListener("click", openPrivacyModal);
    }

    if (closeBtn) {
        closeBtn.addEventListener("click", closePrivacyModal);
    }

    if (acceptBtn) {
        acceptBtn.addEventListener("click", closePrivacyModal);
    }

    overlay.addEventListener("click", (e) => {
        if (e.target === overlay) {
            closePrivacyModal();
        }
    });
}

if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", initPrivacyModal);
} else {
    initPrivacyModal();
}

/* =========================================================
   FFC NEWS & COMMUNITY SYSTEM (NOTICIAS Y COMENTARIOS)
========================================================= */

// Global News State
window.ffcNewsArticles = [];
window.ffcNewsActiveCategory = "all";
window.ffcNewsSearchQuery = "";
window.ffcActiveReadingArticle = null;
window.ffcEditingArticleId = null;
window.ffcAdminNewsFilter = "all";
window.ffcAdminNewsSearchQuery = "";
let isNewsInitialLoaded = false;
let newsUnsubscribe = null;
let commentsUnsubscribe = null;

// Helpers: Local Cache Persistence
function loadCachedNewsArticles() {
    try {
        const cached = localStorage.getItem("ffc_news_articles_v1");
        if (cached) {
            const parsed = JSON.parse(cached);
            if (Array.isArray(parsed)) {
                // Filter out any leftover legacy example/seed IDs
                const cleaned = parsed.filter(item => 
                    item && 
                    item.id !== "news_official_monza_review" && 
                    item.id !== "news_official_dieguiosk_lead" && 
                    item.id !== "news_official_fantasy_market"
                );
                return cleaned;
            }
        }
    } catch (e) {
        console.warn("Error loading cached news:", e);
    }
    return [];
}

function saveCachedNewsArticles(articles) {
    try {
        localStorage.setItem("ffc_news_articles_v1", JSON.stringify(articles || []));
    } catch (e) {
        console.warn("Error caching news:", e);
    }
}

function loadCachedComments(newsId) {
    try {
        const key = "ffc_news_comments_" + newsId;
        const cached = localStorage.getItem(key);
        if (cached) {
            const parsed = JSON.parse(cached);
            if (Array.isArray(parsed)) return parsed;
        }
    } catch (e) {
        console.warn("Error loading cached comments:", e);
    }
    return [];
}

function saveCachedComments(newsId, comments) {
    try {
        const key = "ffc_news_comments_" + newsId;
        localStorage.setItem(key, JSON.stringify(comments || []));
    } catch (e) {
        console.warn("Error saving cached comments:", e);
    }
}

// Format date helper
function formatNewsDate(isoString) {
    if (!isoString) return "";
    try {
        const d = new Date(isoString);
        return d.toLocaleDateString(currentLanguage === "en" ? "en-US" : "es-ES", {
            day: "numeric",
            month: "short",
            year: "numeric"
        });
    } catch (e) {
        return "";
    }
}

function formatNewsDateTime(isoString) {
    if (!isoString) return "";
    try {
        const d = new Date(isoString);
        return d.toLocaleDateString(currentLanguage === "en" ? "en-US" : "es-ES", {
            day: "numeric",
            month: "short",
            year: "numeric",
            hour: "2-digit",
            minute: "2-digit"
        });
    } catch (e) {
        return "";
    }
}

function estimateReadingTime(content) {
    if (!content) return "1 min";
    const words = content.trim().split(/\s+/).length;
    const mins = Math.max(1, Math.ceil(words / 200));
    return currentLanguage === "en" ? `${mins} min read` : `Lectura: ${mins} min`;
}

// Category Translation Helper
function translateNewsCategory(cat, lang = currentLanguage) {
    if (!cat) return lang === "en" ? "Community" : "Comunidad";
    const clean = cat.toLowerCase();
    if (lang === "en") {
        if (clean.includes("carrera") || clean.includes("race")) return "Races";
        if (clean.includes("fichaje") || clean.includes("transfer")) return "Transfers";
        if (clean.includes("piloto") || clean.includes("driver")) return "Drivers";
        if (clean.includes("crónica") || clean.includes("cronica") || clean.includes("report")) return "Reports";
        if (clean.includes("técnica") || clean.includes("tecnica") || clean.includes("tech")) return "Technical Analysis";
        if (clean.includes("comunidad") || clean.includes("community")) return "Community";
        return cat;
    } else {
        if (clean.includes("race") || clean.includes("carrera")) return "Carreras";
        if (clean.includes("transfer") || clean.includes("fichaje")) return "Fichajes";
        if (clean.includes("driver") || clean.includes("piloto")) return "Pilotos";
        if (clean.includes("report") || clean.includes("crónica") || clean.includes("cronica")) return "Crónicas";
        if (clean.includes("tech") || clean.includes("técnica") || clean.includes("tecnica")) return "Análisis Técnico";
        if (clean.includes("community") || clean.includes("comunidad")) return "Comunidad";
        return cat;
    }
}

// Category Badge CSS Class Helper
function getNewsCategoryClass(cat) {
    if (!cat) return "news-cat-comunidad";
    const clean = cat.toLowerCase();
    if (clean.includes("carrera") || clean.includes("race")) return "news-cat-carreras";
    if (clean.includes("fichaje") || clean.includes("transfer")) return "news-cat-fichajes";
    if (clean.includes("piloto") || clean.includes("driver")) return "news-cat-pilotos";
    if (clean.includes("crónica") || clean.includes("cronica") || clean.includes("report")) return "news-cat-cronicas";
    if (clean.includes("técnica") || clean.includes("tecnica") || clean.includes("tech")) return "news-cat-tecnica";
    return "news-cat-comunidad";
}

// Update Admin Pending Badge
function updateAdminNewsBadge() {
    const badge = document.getElementById("adminTabNewsBadge");
    const allChip = document.getElementById("adminNewsFilterAllCount");
    const pendingChip = document.getElementById("adminNewsFilterPendingCount");
    const approvedChip = document.getElementById("adminNewsFilterApprovedCount");
    const rejectedChip = document.getElementById("adminNewsFilterRejectedCount");

    const all = window.ffcNewsArticles || [];
    const pendingCount = all.filter(a => a.status === "pending").length;
    const approvedCount = all.filter(a => a.status === "approved").length;
    const rejectedCount = all.filter(a => a.status === "rejected").length;

    if (badge) {
        badge.textContent = pendingCount;
        badge.style.display = pendingCount > 0 ? "inline-flex" : "inline-flex";
    }
    if (allChip) allChip.textContent = all.length;
    if (pendingChip) pendingChip.textContent = pendingCount;
    if (approvedChip) approvedChip.textContent = approvedCount;
    if (rejectedChip) rejectedChip.textContent = rejectedCount;
}

// =========================================================
// REAL-TIME FIRESTORE SYNCHRONIZATION FOR NEWS
// =========================================================
function initNewsRealtimeSync() {
    if (window._ffcNewsSyncInit) return;
    window._ffcNewsSyncInit = true;

    // 1. Initial State from Cache
    window.ffcNewsArticles = loadCachedNewsArticles();
    renderPublicNewsSection();
    updateAdminNewsBadge();

    // 2. Set up Firestore Real-time Listener for News Articles
    try {
        const newsColRef = collection(db, "noticias");
        newsUnsubscribe = onSnapshot(newsColRef, (snapshot) => {
            const cloudArticles = [];
            snapshot.forEach(docSnap => {
                const data = docSnap.data();
                if (docSnap.id === "news_official_monza_review" || 
                    docSnap.id === "news_official_dieguiosk_lead" || 
                    docSnap.id === "news_official_fantasy_market") {
                    return;
                }
                const currentLiveCount = (window.ffcNewsCommentsCounts && typeof window.ffcNewsCommentsCounts[docSnap.id] === "number") 
                    ? window.ffcNewsCommentsCounts[docSnap.id] 
                    : (typeof data.commentsCount === "number" ? data.commentsCount : 0);
                cloudArticles.push({
                    id: docSnap.id,
                    ...data,
                    commentsCount: currentLiveCount
                });
            });

            // Sort by createdAt descending
            cloudArticles.sort((a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0));

            window.ffcNewsArticles = cloudArticles;
            saveCachedNewsArticles(cloudArticles);
            isNewsInitialLoaded = true;

            renderPublicNewsSection();
            updateAdminNewsBadge();
            if (typeof renderAdminNewsTab === "function") {
                renderAdminNewsTab();
            }
        }, (error) => {
            console.warn("Firestore news sync error, keeping cached state:", error);
            renderPublicNewsSection();
            updateAdminNewsBadge();
        });
    } catch (e) {
        console.warn("Could not attach news onSnapshot listener:", e);
    }

    // 3. Global real-time listener for comments collection to ensure 100% accurate live count
    try {
        const allCommentsCol = collection(db, "noticias_comentarios");
        onSnapshot(allCommentsCol, (snap) => {
            const liveCounts = {};
            snap.forEach(docSnap => {
                const d = docSnap.data();
                if (d && d.newsId) {
                    liveCounts[d.newsId] = (liveCounts[d.newsId] || 0) + 1;
                }
            });
            window.ffcNewsCommentsCounts = liveCounts;

            // Sync with active in-memory articles
            if (window.ffcNewsArticles && window.ffcNewsArticles.length > 0) {
                let changed = false;
                window.ffcNewsArticles.forEach(art => {
                    const exactCount = liveCounts[art.id] || 0;
                    if (art.commentsCount !== exactCount) {
                        art.commentsCount = exactCount;
                        changed = true;
                    }
                });
                if (changed) {
                    saveCachedNewsArticles(window.ffcNewsArticles);
                    renderPublicNewsSection();
                }
            }

            // Sync active reader modal if open
            if (window.ffcActiveReadingArticle) {
                const activeId = window.ffcActiveReadingArticle.id;
                const exactCount = liveCounts[activeId] || 0;
                window.ffcActiveReadingArticle.commentsCount = exactCount;
                const commentsCountText = document.getElementById("articleCommentsCountText");
                const commentsTotalBadge = document.getElementById("newsCommentsTotalBadge");
                if (commentsCountText) {
                    const commentWord = currentLanguage === "en" ? (exactCount === 1 ? "comment" : "comments") : (exactCount === 1 ? "comentario" : "comentarios");
                    commentsCountText.textContent = `${exactCount} ${commentWord}`;
                }
                if (commentsTotalBadge) commentsTotalBadge.textContent = exactCount;
            }
        }, (err) => {
            console.warn("Error streaming all comments count:", err);
        });
    } catch(e) {
        console.warn("Could not attach global comments listener:", e);
    }
}

// =========================================================
// PUBLIC NEWS SECTION RENDERING
// =========================================================
function renderPublicNewsSection() {
    const grid = document.getElementById("newsGrid");
    const emptyState = document.getElementById("newsEmptyState");
    if (!grid) return;

    const allArticles = window.ffcNewsArticles || [];
    // Only approved articles are public
    let approved = allArticles.filter(a => a.status === "approved");

    // Category filter
    if (window.ffcNewsActiveCategory && window.ffcNewsActiveCategory !== "all") {
        approved = approved.filter(a => a.category === window.ffcNewsActiveCategory);
    }

    // Search query filter
    if (window.ffcNewsSearchQuery && window.ffcNewsSearchQuery.trim()) {
        const q = window.ffcNewsSearchQuery.trim().toLowerCase();
        approved = approved.filter(a => 
            (a.title && a.title.toLowerCase().includes(q)) ||
            (a.summary && a.summary.toLowerCase().includes(q)) ||
            (a.content && a.content.toLowerCase().includes(q)) ||
            (a.authorName && a.authorName.toLowerCase().includes(q)) ||
            (a.category && a.category.toLowerCase().includes(q))
        );
    }

    if (approved.length === 0) {
        grid.style.display = "none";
        if (emptyState) {
            emptyState.style.display = "block";
            const emptyTitle = document.getElementById("newsEmptyTitle");
            const emptyDesc = document.getElementById("newsEmptyDesc");
            const resetBtn = document.getElementById("btnResetNewsFilters");

            const isFiltered = (window.ffcNewsActiveCategory && window.ffcNewsActiveCategory !== "all") || (window.ffcNewsSearchQuery && window.ffcNewsSearchQuery.trim());

            if (isFiltered) {
                if (emptyTitle) emptyTitle.textContent = currentLanguage === "en" ? "No news found" : "No se encontraron noticias";
                if (emptyDesc) emptyDesc.textContent = currentLanguage === "en" ? "No articles match your current category or search criteria." : "No hay artículos que coincidan con los filtros o la búsqueda seleccionada.";
                if (resetBtn) resetBtn.style.display = "inline-flex";
            } else {
                if (emptyTitle) emptyTitle.textContent = currentLanguage === "en" ? "No published news yet" : "Todavía no hay noticias publicadas";
                if (emptyDesc) emptyDesc.textContent = currentLanguage === "en" ? "Be the first to propose an article or official league announcement!" : "¡Sé el primero en proponer un artículo o redactar un comunicado oficial para la comunidad!";
                if (resetBtn) resetBtn.style.display = "none";
            }
        }
        return;
    }

    grid.style.display = "grid";
    if (emptyState) emptyState.style.display = "none";

    grid.innerHTML = approved.map(article => {
        const catClass = getNewsCategoryClass(article.category);
        const translatedCat = translateNewsCategory(article.category, currentLanguage);

        // Language-sensitive content resolution with automatic fallbacks
        const title = currentLanguage === "en" ? (article.title_en || article.title || "") : (article.title || article.title_en || "");
        const summary = currentLanguage === "en" ? (article.summary_en || article.summary || "") : (article.summary || article.summary_en || "");
        const content = currentLanguage === "en" ? (article.content_en || article.content || "") : (article.content || article.content_en || "");

        const readingTime = estimateReadingTime(content);
        const dateFormatted = formatNewsDate(article.createdAt);
        const initial = (article.authorName || "F").charAt(0).toUpperCase();
        const commentsCount = typeof article.commentsCount === "number" ? article.commentsCount : 0;
        const authorFallback = currentLanguage === "en" ? "Anonymous" : "Anónimo";

        const hasBilingual = (article.title_en && article.title && article.title_en !== article.title) || (article.content_en && article.content && article.content_en !== article.content);
        const bilingualBadge = hasBilingual 
            ? `<span class="news-card-lang-tag" title="${currentLanguage === 'en' ? 'Bilingual article: Available in Spanish & English' : 'Artículo bilingüe: Disponible en Español e Inglés'}">🌐 ES / EN</span>` 
            : ``;

        const editedBadge = article.isEdited
            ? `<span class="news-card-edited-tag" title="${currentLanguage === 'en' ? 'Article has been edited' : 'Artículo editado'}">✏️ ${currentLanguage === 'en' ? 'Edited' : 'Editado'}</span>`
            : ``;

        const imageMarkup = article.imageUrl 
            ? `<img src="${encodeURI(article.imageUrl)}" alt="${encodeURI(title)}" class="news-card-img" loading="lazy" onerror="this.onerror=null; this.parentElement.innerHTML='<div class=\\'news-card-img-fallback\\'><span class=\\'news-fallback-icon\\'>🏎️</span><span class=\\'news-fallback-brand\\'>FORMULA FACTOR</span></div>';">`
            : `<div class="news-card-img-fallback"><span class="news-fallback-icon">🏎️</span><span class="news-fallback-brand">FORMULA FACTOR</span></div>`;

        return `
            <article class="news-card" data-article-id="${article.id}" tabindex="0" role="button" aria-label="${currentLanguage === 'en' ? 'Read' : 'Leer'} ${title}">
                <div class="news-card-img-wrap">
                    <span class="news-card-cat-badge ${catClass}">${translatedCat}</span>
                    ${imageMarkup}
                </div>
                <div class="news-card-body">
                    <div class="news-card-date-row">
                        <span>📅 ${dateFormatted}</span>
                        <span>&bull;</span>
                        <span>⏱️ ${readingTime}</span>
                        ${editedBadge ? `<span>&bull;</span>` + editedBadge : ``}
                    </div>
                    <h3 class="news-card-title">${title}</h3>
                    <p class="news-card-summary">${summary || ""}</p>
                    <div class="news-card-footer">
                        <div class="news-card-author-chip">
                            <div class="news-author-mini-avatar">${initial}</div>
                            <span class="news-author-mini-name">${article.authorName || authorFallback}</span>
                        </div>
                        <div class="news-card-comments-pill">
                            <span>💬</span>
                            <span>${commentsCount}</span>
                        </div>
                    </div>
                </div>
            </article>
        `;
    }).join("");

    // Bind click events on cards
    grid.querySelectorAll(".news-card").forEach(card => {
        const articleId = card.dataset.articleId;
        card.addEventListener("click", () => openNewsArticleModal(articleId));
        card.addEventListener("keydown", (e) => {
            if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                openNewsArticleModal(articleId);
            }
        });
    });
}

// Helper to get authenticated account display name
function getFfcActiveUserName() {
    try {
        if (typeof activeUserAuth !== "undefined" && activeUserAuth) {
            if (activeUserAuth.displayName) return activeUserAuth.displayName;
            if (activeUserAuth.email) return activeUserAuth.email.split("@")[0];
        }
    } catch (e) {}
    try {
        if (typeof activeUserData !== "undefined" && activeUserData) {
            if (activeUserData.displayName) return activeUserData.displayName;
            if (activeUserData.email) return activeUserData.email.split("@")[0];
        }
    } catch (e) {}
    try {
        if (typeof LocalAuthStore !== "undefined") {
            const local = LocalAuthStore.getCurrentUser();
            if (local) {
                if (local.displayName) return local.displayName;
                if (local.email) return local.email.split("@")[0];
            }
        }
    } catch (e) {}
    return null;
}

// =========================================================
// WORD-STYLE FULLSCREEN NEWS EDITOR & MEDIA UPLOAD
// =========================================================

// Fullscreen toggle for the news editor
window.toggleNewsEditorFullscreen = function() {
    const card = document.getElementById("newsWordEditorCard");
    const icon = document.getElementById("fullscreenIcon");
    const label = document.getElementById("fullscreenLabel");
    if (!card) return;

    const isFullscreen = card.classList.toggle("is-fullscreen");
    const isEn = typeof currentLanguage !== "undefined" && currentLanguage === "en";

    if (icon) icon.textContent = isFullscreen ? "🗗" : "⛶";
    if (label) label.textContent = isFullscreen 
        ? (isEn ? "Exit Fullscreen" : "Salir de pantalla completa") 
        : (isEn ? "Fullscreen" : "Pantalla completa");
};

// Active language tab in news editor: 'es' or 'en'
window.currentNewsEditorLang = "es";

function getActiveNewsEditorCanvas() {
    const lang = window.currentNewsEditorLang || "es";
    return document.getElementById("newsSubmitContentEditor_" + lang) || 
           document.getElementById("newsSubmitContentEditor_es") || 
           document.getElementById("newsSubmitContentEditor");
}

window.switchNewsEditorLang = function(targetLang) {
    if (targetLang !== "es" && targetLang !== "en") targetLang = "es";
    window.currentNewsEditorLang = targetLang;

    // Switch Tab Buttons
    const btnEs = document.getElementById("btnNewsLangTab_es");
    const btnEn = document.getElementById("btnNewsLangTab_en");
    if (btnEs) btnEs.classList.toggle("active", targetLang === "es");
    if (btnEn) btnEn.classList.toggle("active", targetLang === "en");

    // Switch Panes
    const paneEs = document.getElementById("newsLangPane_es");
    const paneEn = document.getElementById("newsLangPane_en");
    if (paneEs) paneEs.style.display = (targetLang === "es") ? "block" : "none";
    if (paneEn) paneEn.style.display = (targetLang === "en") ? "block" : "none";

    syncEditorContent();
    updateEditorWordStats();
};

window.handleEditorFieldInput = function(lang) {
    syncEditorContent();
    updateEditorWordStats();
    autoSaveDraft();
};

window.handleEditorCanvasInput = function(lang) {
    syncEditorContent();
    updateEditorWordStats();
    autoSaveDraft();
};

// Word-style formatting commands via execCommand targeting active editor canvas
window.executeEditorCommand = function(command, value = null) {
    const editor = getActiveNewsEditorCanvas();
    if (!editor) return;
    editor.focus();
    try {
        document.execCommand(command, false, value);
    } catch (err) {
        console.warn("Error executing command:", command, err);
    }
    syncEditorContent();
    updateEditorWordStats();
    autoSaveDraft();
};

// Heading and block formatting
window.applyRibbonHeading = function(tag) {
    const editor = getActiveNewsEditorCanvas();
    if (!editor) return;
    editor.focus();
    if (!tag || tag === "p") {
        document.execCommand("formatBlock", false, "<p>");
    } else {
        document.execCommand("formatBlock", false, `<${tag}>`);
    }
    syncEditorContent();
    updateEditorWordStats();
    autoSaveDraft();
};

// Gold highlight formatting
window.applyRibbonHighlight = function() {
    const editor = getActiveNewsEditorCanvas();
    if (!editor) return;
    editor.focus();

    const selection = window.getSelection();
    if (!selection || selection.rangeCount === 0 || selection.isCollapsed) {
        return;
    }

    const range = selection.getRangeAt(0);
    const selectedContent = range.extractContents();
    const span = document.createElement("span");
    span.className = "gold-highlight";
    span.appendChild(selectedContent);
    range.insertNode(span);
    
    // Move selection right after inserted span
    selection.removeAllRanges();
    const newRange = document.createRange();
    newRange.setStartAfter(span);
    newRange.collapse(true);
    selection.addRange(newRange);

    syncEditorContent();
    updateEditorWordStats();
    autoSaveDraft();
};

// Quote / Driver Statement block
window.applyRibbonQuote = function() {
    const editor = getActiveNewsEditorCanvas();
    if (!editor) return;
    editor.focus();
    document.execCommand("formatBlock", false, "<blockquote>");
    syncEditorContent();
    updateEditorWordStats();
    autoSaveDraft();
};

// Insert web hyperlink
window.applyRibbonLink = function() {
    const isEn = typeof currentLanguage !== "undefined" && currentLanguage === "en";
    const promptMsg = isEn ? "Enter the web URL (e.g. https://...):" : "Introduce el enlace web (ej: https://...):";
    const url = prompt(promptMsg, "https://");
    if (url && url.trim() && url !== "https://") {
        executeEditorCommand("createLink", url.trim());
    }
};

// Insert inline image inside active article body
window.triggerInsertArticleImage = function() {
    const input = document.getElementById("articleBodyImgFileInput");
    if (input) {
        input.value = "";
        input.click();
    }
};

window.handleArticleBodyImageUpload = function(event) {
    const file = event.target.files && event.target.files[0];
    if (!file) return;
    compressAndInsertBodyImage(file);
};

function compressAndInsertBodyImage(file) {
    if (!file || !file.type.startsWith("image/")) {
        const isEn = typeof currentLanguage !== "undefined" && currentLanguage === "en";
        alert(isEn ? "Please select a valid image file." : "Por favor selecciona un archivo de imagen válido.");
        return;
    }

    const reader = new FileReader();
    reader.onload = function(e) {
        const img = new Image();
        img.onload = function() {
            const maxDim = 960;
            let width = img.width;
            let height = img.height;
            if (width > maxDim || height > maxDim) {
                if (width > height) {
                    height = Math.round((height * maxDim) / width);
                    width = maxDim;
                } else {
                    width = Math.round((width * maxDim) / height);
                    height = maxDim;
                }
            }
            const canvas = document.createElement("canvas");
            canvas.width = width;
            canvas.height = height;
            const ctx = canvas.getContext("2d");
            ctx.drawImage(img, 0, 0, width, height);
            const compressedDataUrl = canvas.toDataURL("image/jpeg", 0.84);

            const editor = getActiveNewsEditorCanvas();
            if (editor) {
                editor.focus();
                document.execCommand("insertImage", false, compressedDataUrl);
                const imgs = editor.querySelectorAll("img:not(.article-inline-img)");
                imgs.forEach(i => i.classList.add("article-inline-img"));
                syncEditorContent();
                updateEditorWordStats();
                autoSaveDraft();
            }
        };
        img.src = e.target.result;
    };
    reader.readAsDataURL(file);
}

// Synchronize rich editor canvases into hidden form textareas & fallback aliases
window.syncEditorContent = function() {
    const editorEs = document.getElementById("newsSubmitContentEditor_es");
    const textareaEs = document.getElementById("newsSubmitContent_es");
    if (editorEs && textareaEs) {
        let htmlEs = editorEs.innerHTML.trim();
        if (htmlEs === "<p><br></p>" || htmlEs === "<br>" || htmlEs === "<div><br></div>") {
            htmlEs = "";
        }
        textareaEs.value = htmlEs;
    }

    const editorEn = document.getElementById("newsSubmitContentEditor_en");
    const textareaEn = document.getElementById("newsSubmitContent_en");
    if (editorEn && textareaEn) {
        let htmlEn = editorEn.innerHTML.trim();
        if (htmlEn === "<p><br></p>" || htmlEn === "<br>" || htmlEn === "<div><br></div>") {
            htmlEn = "";
        }
        textareaEn.value = htmlEn;
    }

    // Keep compatibility aliases in sync
    const titleEs = document.getElementById("newsSubmitTitle_es");
    const summaryEs = document.getElementById("newsSubmitSummary_es");
    const aliasTitle = document.getElementById("newsSubmitTitle");
    const aliasSummary = document.getElementById("newsSubmitSummary");
    const aliasContent = document.getElementById("newsSubmitContent");
    const aliasEditor = document.getElementById("newsSubmitContentEditor");

    if (aliasTitle && titleEs) aliasTitle.value = titleEs.value;
    if (aliasSummary && summaryEs) aliasSummary.value = summaryEs.value;
    if (aliasContent && textareaEs) aliasContent.value = textareaEs.value;
    if (aliasEditor && editorEs) aliasEditor.innerHTML = editorEs.innerHTML;
};

// Word counter and estimated reading time with bilingual completion checks
window.updateEditorWordStats = function() {
    const isEn = typeof currentLanguage !== "undefined" && currentLanguage === "en";
    const curLang = window.currentNewsEditorLang || "es";

    const titleEsInput = document.getElementById("newsSubmitTitle_es");
    const summaryEsInput = document.getElementById("newsSubmitSummary_es");
    const editorEs = document.getElementById("newsSubmitContentEditor_es");

    const titleEnInput = document.getElementById("newsSubmitTitle_en");
    const summaryEnInput = document.getElementById("newsSubmitSummary_en");
    const editorEn = document.getElementById("newsSubmitContentEditor_en");

    // Char counters
    const tEsLen = titleEsInput ? titleEsInput.value.length : 0;
    const sEsLen = summaryEsInput ? summaryEsInput.value.length : 0;
    const tEnLen = titleEnInput ? titleEnInput.value.length : 0;
    const sEnLen = summaryEnInput ? summaryEnInput.value.length : 0;

    const countTitleEs = document.getElementById("charCountTitle_es");
    const countSummaryEs = document.getElementById("charCountSummary_es");
    const countTitleEn = document.getElementById("charCountTitle_en");
    const countSummaryEn = document.getElementById("charCountSummary_en");

    if (countTitleEs) countTitleEs.textContent = `${tEsLen} / 120`;
    if (countSummaryEs) countSummaryEs.textContent = `${sEsLen} / 240`;
    if (countTitleEn) countTitleEn.textContent = `${tEnLen} / 120`;
    if (countSummaryEn) countSummaryEn.textContent = `${sEnLen} / 240`;

    // Completion flags
    const esTitleFilled = titleEsInput && titleEsInput.value.trim().length > 0;
    const esText = editorEs ? (editorEs.innerText || editorEs.textContent || "").trim() : "";
    const esContentFilled = esText.length > 0;
    const esReady = esTitleFilled && esContentFilled;

    const enTitleFilled = titleEnInput && titleEnInput.value.trim().length > 0;
    const enText = editorEn ? (editorEn.innerText || editorEn.textContent || "").trim() : "";
    const enContentFilled = enText.length > 0;
    const enReady = enTitleFilled && enContentFilled;

    // Status badges on language tabs
    const badgeEs = document.getElementById("badgeLangStatus_es");
    if (badgeEs) {
        if (esReady) {
            badgeEs.className = "lang-status-badge ready";
            badgeEs.textContent = isEn ? "✓ Completed" : "✓ Listo";
        } else {
            badgeEs.className = "lang-status-badge pending";
            badgeEs.textContent = isEn ? "⚠️ Incomplete" : "⚠️ Incompleto";
        }
    }

    const badgeEn = document.getElementById("badgeLangStatus_en");
    if (badgeEn) {
        if (enReady) {
            badgeEn.className = "lang-status-badge ready";
            badgeEn.textContent = isEn ? "✓ Completed" : "✓ Listo";
        } else {
            badgeEn.className = "lang-status-badge pending";
            badgeEn.textContent = isEn ? "⚠️ Incomplete" : "⚠️ Incompleto";
        }
    }

    const headerTitle = document.getElementById("newsBilingualHeaderTitle");
    if (headerTitle) {
        const completedCount = (esReady ? 1 : 0) + (enReady ? 1 : 0);
        headerTitle.textContent = isEn 
            ? `MANDATORY LANGUAGES (${completedCount}/2)` 
            : `IDIOMAS OBLIGATORIOS (${completedCount}/2)`;
    }

    // Active tab word stats
    const activeText = curLang === "en" ? enText : esText;
    const activeTitle = curLang === "en" ? (titleEnInput ? titleEnInput.value : "") : (titleEsInput ? titleEsInput.value : "");
    const activeSummary = curLang === "en" ? (summaryEnInput ? summaryEnInput.value : "") : (summaryEsInput ? summaryEsInput.value : "");

    const combinedActive = [activeTitle, activeSummary, activeText].join(" ").trim();
    const words = combinedActive ? combinedActive.split(/\s+/).filter(w => w.length > 0).length : 0;

    const countEl = document.getElementById("editorWordCount");
    const timeEl = document.getElementById("editorReadTime");

    if (countEl) {
        const langTag = curLang === "en" ? "EN" : "ES";
        countEl.textContent = isEn 
            ? `[${langTag}] ${words} ${words === 1 ? "word" : "words"}` 
            : `[${langTag}] ${words} ${words === 1 ? "palabra" : "palabras"}`;
    }

    if (timeEl) {
        const mins = Math.max(1, Math.ceil(words / 190));
        timeEl.textContent = isEn ? `${mins} min read` : `${mins} min de lectura`;
    }
};

// =========================================================
// COVER PHOTO UPLOAD, COMPRESSION & PREVIEW
// =========================================================

window.triggerCoverFileInput = function() {
    const input = document.getElementById("newsCoverFileInput");
    if (input) {
        input.value = "";
        input.click();
    }
};

window.handleCoverFileUpload = function(event) {
    const file = event.target.files && event.target.files[0];
    if (!file) return;
    compressAndSetCoverImage(file);
};

function compressAndSetCoverImage(file) {
    if (!file || !file.type.startsWith("image/")) {
        const isEn = typeof currentLanguage !== "undefined" && currentLanguage === "en";
        alert(isEn ? "Please select a valid image file." : "Por favor selecciona un archivo de imagen válido.");
        return;
    }

    const reader = new FileReader();
    reader.onload = function(e) {
        const img = new Image();
        img.onload = function() {
            const maxDim = 1300;
            let width = img.width;
            let height = img.height;
            if (width > maxDim || height > maxDim) {
                if (width > height) {
                    height = Math.round((height * maxDim) / width);
                    width = maxDim;
                } else {
                    width = Math.round((width * maxDim) / height);
                    height = maxDim;
                }
            }
            const canvas = document.createElement("canvas");
            canvas.width = width;
            canvas.height = height;
            const ctx = canvas.getContext("2d");
            ctx.drawImage(img, 0, 0, width, height);
            const compressedDataUrl = canvas.toDataURL("image/jpeg", 0.85);

            setCoverImageSource(compressedDataUrl);
            autoSaveDraft();
        };
        img.src = e.target.result;
    };
    reader.readAsDataURL(file);
}

window.setCoverImageSource = function(srcUrl) {
    const imageInput = document.getElementById("newsSubmitImage");
    const previewImg = document.getElementById("coverImagePreview");
    const dropzonePrompt = document.getElementById("dropzonePrompt");
    const dropzonePreview = document.getElementById("dropzonePreview");

    if (imageInput) imageInput.value = srcUrl || "";

    if (srcUrl) {
        if (previewImg) previewImg.src = srcUrl;
        if (dropzonePrompt) dropzonePrompt.style.display = "none";
        if (dropzonePreview) dropzonePreview.style.display = "block";
    } else {
        if (previewImg) previewImg.src = "";
        if (dropzonePrompt) dropzonePrompt.style.display = "flex";
        if (dropzonePreview) dropzonePreview.style.display = "none";
    }
};

window.removeCoverImage = function() {
    setCoverImageSource("");
    const urlInput = document.getElementById("newsSubmitImage");
    if (urlInput) urlInput.value = "";
    autoSaveDraft();
};

window.toggleCoverUrlInput = function() {
    const wrap = document.getElementById("coverUrlInputWrap");
    if (!wrap) return;
    const isHidden = wrap.style.display === "none" || !wrap.style.display;
    wrap.style.display = isHidden ? "block" : "none";
    if (isHidden) {
        const input = document.getElementById("newsSubmitImage");
        if (input) input.focus();
    }
};

window.handleCoverUrlInput = function(url) {
    const trimmed = (url || "").trim();
    if (trimmed) {
        setCoverImageSource(trimmed);
    } else {
        removeCoverImage();
    }
    autoSaveDraft();
};

// Preset image button handler
window.setPresetNewsImage = function() {
    const presets = [
        "https://images.unsplash.com/photo-1568605117036-5fe5e7bab0b7?auto=format&fit=crop&w=1200&q=80",
        "https://images.unsplash.com/photo-1511919884226-fd3cad34687c?auto=format&fit=crop&w=1200&q=80",
        "https://images.unsplash.com/photo-1580273916550-e323be2ae537?auto=format&fit=crop&w=1200&q=80",
        "https://images.unsplash.com/photo-1503376780353-7e6692767b70?auto=format&fit=crop&w=1200&q=80"
    ];
    const chosen = presets[Math.floor(Math.random() * presets.length)];
    setCoverImageSource(chosen);
    autoSaveDraft();
};

// =========================================================
// LOCAL DRAFT AUTO-SAVE & RESTORATION (DUAL-LANGUAGE)
// =========================================================

const NEWS_DRAFT_KEY = "ffc_news_editor_draft_v2";

window.autoSaveDraft = function() {
    if (window.ffcEditingArticleId) return;

    const titleEsInput = document.getElementById("newsSubmitTitle_es");
    const summaryEsInput = document.getElementById("newsSubmitSummary_es");
    const editorEs = document.getElementById("newsSubmitContentEditor_es");

    const titleEnInput = document.getElementById("newsSubmitTitle_en");
    const summaryEnInput = document.getElementById("newsSubmitSummary_en");
    const editorEn = document.getElementById("newsSubmitContentEditor_en");

    const categorySelect = document.getElementById("newsSubmitCategory");
    const imageInput = document.getElementById("newsSubmitImage");
    const draftBadge = document.getElementById("newsDraftStatusIndicator");

    const draft = {
        title_es: titleEsInput ? titleEsInput.value : "",
        summary_es: summaryEsInput ? summaryEsInput.value : "",
        content_es: editorEs ? editorEs.innerHTML : "",
        title_en: titleEnInput ? titleEnInput.value : "",
        summary_en: summaryEnInput ? summaryEnInput.value : "",
        content_en: editorEn ? editorEn.innerHTML : "",
        category: categorySelect ? categorySelect.value : "Comunidad",
        imageUrl: imageInput ? imageInput.value : "",
        activeLang: window.currentNewsEditorLang || "es",
        updatedAt: Date.now()
    };

    const hasData = (
        (draft.title_es && draft.title_es.trim().length > 0) || 
        (draft.content_es && draft.content_es.length > 20) ||
        (draft.title_en && draft.title_en.trim().length > 0) || 
        (draft.content_en && draft.content_en.length > 20)
    );

    if (hasData) {
        try {
            localStorage.setItem(NEWS_DRAFT_KEY, JSON.stringify(draft));
            if (draftBadge) {
                draftBadge.style.opacity = "1";
            }
        } catch (e) {}
    }
};

function restoreDraftIfExists() {
    if (window.ffcEditingArticleId) return;

    try {
        const raw = localStorage.getItem(NEWS_DRAFT_KEY);
        if (!raw) return;
        const draft = JSON.parse(raw);
        if (!draft) return;

        const titleEsInput = document.getElementById("newsSubmitTitle_es");
        const summaryEsInput = document.getElementById("newsSubmitSummary_es");
        const editorEs = document.getElementById("newsSubmitContentEditor_es");

        const titleEnInput = document.getElementById("newsSubmitTitle_en");
        const summaryEnInput = document.getElementById("newsSubmitSummary_en");
        const editorEn = document.getElementById("newsSubmitContentEditor_en");

        const categorySelect = document.getElementById("newsSubmitCategory");
        const draftBadge = document.getElementById("newsDraftStatusIndicator");

        if (titleEsInput && draft.title_es) titleEsInput.value = draft.title_es;
        if (summaryEsInput && draft.summary_es) summaryEsInput.value = draft.summary_es;
        if (editorEs && draft.content_es) editorEs.innerHTML = draft.content_es;

        if (titleEnInput && draft.title_en) titleEnInput.value = draft.title_en;
        if (summaryEnInput && draft.summary_en) summaryEnInput.value = draft.summary_en;
        if (editorEn && draft.content_en) editorEn.innerHTML = draft.content_en;

        if (categorySelect && draft.category) categorySelect.value = draft.category;
        if (draft.imageUrl) {
            setCoverImageSource(draft.imageUrl);
        }

        if (draft.activeLang) {
            switchNewsEditorLang(draft.activeLang);
        } else {
            switchNewsEditorLang("es");
        }

        syncEditorContent();
        updateEditorWordStats();

        if (draftBadge) {
            draftBadge.style.opacity = "1";
        }
    } catch (e) {
        console.warn("Could not restore draft:", e);
    }
}

function clearNewsDraft() {
    try {
        localStorage.removeItem(NEWS_DRAFT_KEY);
        const draftBadge = document.getElementById("newsDraftStatusIndicator");
        if (draftBadge) draftBadge.style.opacity = "0.4";
    } catch (e) {}
}

// Drag and drop setup for editor canvases and photo dropzone
function initNewsEditorDropzones() {
    const dropzone = document.getElementById("newsPhotoDropzone");
    if (dropzone && !dropzone.dataset.initialized) {
        dropzone.dataset.initialized = "true";

        ["dragenter", "dragover"].forEach(eventName => {
            dropzone.addEventListener(eventName, (e) => {
                e.preventDefault();
                e.stopPropagation();
                dropzone.classList.add("drag-over");
            }, false);
        });

        ["dragleave", "drop"].forEach(eventName => {
            dropzone.addEventListener(eventName, (e) => {
                e.preventDefault();
                e.stopPropagation();
                dropzone.classList.remove("drag-over");
            }, false);
        });

        dropzone.addEventListener("drop", (e) => {
            const dt = e.dataTransfer;
            const files = dt && dt.files;
            if (files && files.length > 0) {
                compressAndSetCoverImage(files[0]);
            }
        });
    }

    // Attach listeners to both Spanish and English editors
    ["newsSubmitContentEditor_es", "newsSubmitContentEditor_en"].forEach(canvasId => {
        const editor = document.getElementById(canvasId);
        if (editor && !editor.dataset.initialized) {
            editor.dataset.initialized = "true";

            editor.addEventListener("paste", (e) => {
                const items = (e.clipboardData || e.originalEvent.clipboardData).items;
                if (items) {
                    for (let i = 0; i < items.length; i++) {
                        if (items[i].type.indexOf("image") !== -1) {
                            e.preventDefault();
                            const file = items[i].getAsFile();
                            compressAndInsertBodyImage(file);
                            return;
                        }
                    }
                }
            });

            editor.addEventListener("keydown", (e) => {
                if (e.ctrlKey || e.metaKey) {
                    if (e.key === "b" || e.key === "B") {
                        e.preventDefault();
                        executeEditorCommand("bold");
                    } else if (e.key === "i" || e.key === "I") {
                        e.preventDefault();
                        executeEditorCommand("italic");
                    } else if (e.key === "u" || e.key === "U") {
                        e.preventDefault();
                        executeEditorCommand("underline");
                    }
                }
            });
        }
    });
}

// Initialize on DOM load
if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", initNewsEditorDropzones);
} else {
    initNewsEditorDropzones();
}

// =========================================================
// SUBMIT & EDIT NEWS MODAL LOGIC (MANDATORY BILINGUAL)
// =========================================================
function openSubmitNewsModal(prefillCategory = null) {
    window.ffcEditingArticleId = null;
    const isEn = typeof currentLanguage !== "undefined" && currentLanguage === "en";
    const u = typeof activeUserAuth !== "undefined" && activeUserAuth ? activeUserAuth : (typeof LocalAuthStore !== "undefined" ? LocalAuthStore.getCurrentUser() : null);

    if (!u || !u.email) {
        if (typeof openUserAuthModal === "function") {
            openUserAuthModal("login");
            if (typeof showAuthAlert === "function") {
                showAuthAlert(isEn 
                    ? "Please sign in with your account to submit news to the community." 
                    : "Por favor inicia sesión con tu cuenta para enviar noticias a la comunidad.");
            }
        }
        return;
    }

    const overlay = document.getElementById("newsSubmitModalOverlay");
    const form = document.getElementById("newsSubmitForm");
    const authorInput = document.getElementById("newsSubmitAuthor");
    const statusMsg = document.getElementById("newsSubmitStatusMsg");
    const catSelect = document.getElementById("newsSubmitCategory");
    const submitBtn = document.getElementById("btnSubmitNewsFormAction");
    const modalBadge = document.getElementById("newsSubmitModalBadge");
    const modalTitle = document.getElementById("newsSubmitModalTitle");

    const editorEs = document.getElementById("newsSubmitContentEditor_es");
    const editorEn = document.getElementById("newsSubmitContentEditor_en");

    if (!overlay) return;

    if (form) form.reset();
    if (editorEs) editorEs.innerHTML = "";
    if (editorEn) editorEn.innerHTML = "";
    removeCoverImage();

    if (modalBadge) modalBadge.textContent = isEn ? "PRESS • FFC REDACTION" : "PRENSA • REDACCIÓN FFC";
    if (modalTitle) modalTitle.textContent = isEn ? "✍️ ARTICLE EDITOR (BILINGUAL)" : "✍️ REDACTOR DE ARTÍCULO (BILINGÜE)";

    if (statusMsg) {
        statusMsg.textContent = "";
        statusMsg.className = "news-submit-status";
    }

    const resolvedName = getFfcActiveUserName() || (u.displayName || (u.email ? u.email.split("@")[0] : "Usuario FFC"));
    if (authorInput) {
        authorInput.value = resolvedName;
        authorInput.readOnly = true;
    }

    if (prefillCategory && catSelect) {
        catSelect.value = prefillCategory;
    }

    if (submitBtn) {
        submitBtn.disabled = false;
        const dict = typeof translations !== "undefined" && translations[currentLanguage] ? translations[currentLanguage] : null;
        const userIsAdmin = isUserAdmin(u);
        if (userIsAdmin) {
            submitBtn.innerHTML = isEn ? "<span>🚀</span> Publish Official News" : "<span>🚀</span> Publicar Noticia Oficial";
        } else {
            submitBtn.innerHTML = (dict && dict.news && dict.news.btnSubmitAction) 
                ? dict.news.btnSubmitAction 
                : (isEn ? "<span>🚀</span> Submit for Review" : "<span>🚀</span> Enviar para Revisión");
        }
    }

    switchNewsEditorLang("es");
    restoreDraftIfExists();
    updateEditorWordStats();
    initNewsEditorDropzones();

    overlay.classList.add("active");
    overlay.style.display = "flex";
    overlay.style.opacity = "1";
    overlay.style.visibility = "visible";
    overlay.setAttribute("aria-hidden", "false");
    document.body.classList.add("modal-open");
}

window.openEditNewsArticleModal = function(articleId) {
    const article = (window.ffcNewsArticles || []).find(a => a.id === articleId);
    if (!article) return;

    const isEn = typeof currentLanguage !== "undefined" && currentLanguage === "en";
    const u = typeof activeUserAuth !== "undefined" && activeUserAuth ? activeUserAuth : (typeof LocalAuthStore !== "undefined" ? LocalAuthStore.getCurrentUser() : null);

    if (!u || !u.email) {
        if (typeof openUserAuthModal === "function") {
            openUserAuthModal("login");
            if (typeof showAuthAlert === "function") {
                showAuthAlert(isEn 
                    ? "Please sign in to edit your news article." 
                    : "Por favor inicia sesión para editar tu artículo.");
            }
        }
        return;
    }

    const userIsAdmin = isUserAdmin(u);
    const activeName = getFfcActiveUserName();
    const isAuthor = (
        (u.email && article.authorEmail && u.email.toLowerCase() === article.authorEmail.toLowerCase()) ||
        (u.uid && article.authorUid && u.uid === article.authorUid) ||
        (activeName && article.authorName && activeName.toLowerCase() === article.authorName.toLowerCase()) ||
        (u.displayName && article.authorName && u.displayName.toLowerCase() === article.authorName.toLowerCase())
    );

    if (!userIsAdmin && !isAuthor) {
        alert(isEn ? "You do not have permission to edit this article." : "No tienes permisos para editar este artículo.");
        return;
    }

    window.ffcEditingArticleId = article.id;

    const overlay = document.getElementById("newsSubmitModalOverlay");
    const form = document.getElementById("newsSubmitForm");
    const modalBadge = document.getElementById("newsSubmitModalBadge");
    const modalTitle = document.getElementById("newsSubmitModalTitle");
    const submitBtn = document.getElementById("btnSubmitNewsFormAction");
    const statusMsg = document.getElementById("newsSubmitStatusMsg");

    const categorySelect = document.getElementById("newsSubmitCategory");
    const authorInput = document.getElementById("newsSubmitAuthor");

    const titleEsInput = document.getElementById("newsSubmitTitle_es");
    const summaryEsInput = document.getElementById("newsSubmitSummary_es");
    const editorEs = document.getElementById("newsSubmitContentEditor_es");

    const titleEnInput = document.getElementById("newsSubmitTitle_en");
    const summaryEnInput = document.getElementById("newsSubmitSummary_en");
    const editorEn = document.getElementById("newsSubmitContentEditor_en");

    const draftBadge = document.getElementById("newsDraftStatusIndicator");

    if (form) form.reset();
    if (statusMsg) {
        statusMsg.textContent = "";
        statusMsg.className = "news-submit-status";
    }

    if (categorySelect) categorySelect.value = article.category || "Comunidad";
    if (authorInput) {
        authorInput.value = article.authorName || (getFfcActiveUserName() || "Usuario FFC");
        authorInput.readOnly = true;
    }

    if (article.imageUrl) {
        setCoverImageSource(article.imageUrl);
    } else {
        removeCoverImage();
    }

    // Populate Spanish fields
    const titleEsVal = article.title || "";
    const summaryEsVal = article.summary || "";
    const contentEsVal = article.content || "";

    if (titleEsInput) titleEsInput.value = titleEsVal;
    if (summaryEsInput) summaryEsInput.value = summaryEsVal;
    if (editorEs) {
        if (/<[a-z][\s\S]*>/i.test(contentEsVal)) {
            editorEs.innerHTML = contentEsVal;
        } else {
            const paragraphs = (contentEsVal || "").split(/\n\n+/).filter(p => p.trim().length > 0);
            editorEs.innerHTML = paragraphs.map(p => `<p>${p.replace(/\n/g, "<br>")}</p>`).join("");
        }
    }

    // Populate English fields
    const titleEnVal = article.title_en || "";
    const summaryEnVal = article.summary_en || "";
    const contentEnVal = article.content_en || "";

    if (titleEnInput) titleEnInput.value = titleEnVal;
    if (summaryEnInput) summaryEnInput.value = summaryEnVal;
    if (editorEn) {
        if (/<[a-z][\s\S]*>/i.test(contentEnVal)) {
            editorEn.innerHTML = contentEnVal;
        } else {
            const paragraphs = (contentEnVal || "").split(/\n\n+/).filter(p => p.trim().length > 0);
            editorEn.innerHTML = paragraphs.map(p => `<p>${p.replace(/\n/g, "<br>")}</p>`).join("");
        }
    }

    switchNewsEditorLang(isEn ? "en" : "es");
    syncEditorContent();
    updateEditorWordStats();
    initNewsEditorDropzones();

    if (draftBadge) draftBadge.style.opacity = "0";

    if (modalBadge) modalBadge.textContent = isEn ? "EDITION • FFC PRESS" : "EDICIÓN • PRENSA FFC";
    if (modalTitle) modalTitle.textContent = isEn ? "✏️ EDIT ARTICLE (BILINGUAL)" : "✏️ EDITAR ARTÍCULO (BILINGÜE)";

    if (submitBtn) {
        submitBtn.disabled = false;
        if (userIsAdmin) {
            submitBtn.innerHTML = isEn ? "<span>💾</span> Save Official Changes" : "<span>💾</span> Guardar Cambios Oficiales";
        } else {
            submitBtn.innerHTML = isEn ? "<span>💾</span> Save & Send to Admins" : "<span>💾</span> Guardar y Enviar a Revisión";
        }
    }

    if (overlay) {
        overlay.classList.add("active");
        overlay.style.display = "flex";
        overlay.style.opacity = "1";
        overlay.style.visibility = "visible";
        overlay.setAttribute("aria-hidden", "false");
        document.body.classList.add("modal-open");
    }
};

function closeSubmitNewsModal() {
    const overlay = document.getElementById("newsSubmitModalOverlay");
    const editorCard = document.getElementById("newsWordEditorCard");
    if (!overlay) return;
    
    overlay.classList.remove("active");
    overlay.style.display = "none";
    overlay.style.opacity = "0";
    overlay.style.visibility = "hidden";
    overlay.setAttribute("aria-hidden", "true");
    document.body.classList.remove("modal-open");
    
    if (editorCard) {
        editorCard.classList.remove("is-fullscreen");
        const icon = document.getElementById("fullscreenIcon");
        if (icon) icon.textContent = "⛶";
    }

    window.isNewsSubmitting = false;
    window.ffcEditingArticleId = null;

    const isEn = typeof currentLanguage !== "undefined" && currentLanguage === "en";
    const modalBadge = document.getElementById("newsSubmitModalBadge");
    const modalTitle = document.getElementById("newsSubmitModalTitle");
    if (modalBadge) modalBadge.textContent = isEn ? "PRESS • FFC REDACTION" : "PRENSA • REDACCIÓN FFC";
    if (modalTitle) modalTitle.textContent = isEn ? "✍️ ARTICLE EDITOR" : "✍️ REDACTOR DE ARTÍCULO";
}

async function handleNewsFormSubmit(e) {
    if (e) {
        e.preventDefault();
        e.stopPropagation();
    }

    if (window.isNewsSubmitting) return;
    window.isNewsSubmitting = true;

    // Ensure content from both contenteditable canvases is synchronized
    syncEditorContent();

    const titleEsInput = document.getElementById("newsSubmitTitle_es");
    const summaryEsInput = document.getElementById("newsSubmitSummary_es");
    const editorEs = document.getElementById("newsSubmitContentEditor_es");

    const titleEnInput = document.getElementById("newsSubmitTitle_en");
    const summaryEnInput = document.getElementById("newsSubmitSummary_en");
    const editorEn = document.getElementById("newsSubmitContentEditor_en");

    const categorySelect = document.getElementById("newsSubmitCategory");
    const imageInput = document.getElementById("newsSubmitImage");
    const statusMsg = document.getElementById("newsSubmitStatusMsg");
    const submitBtn = document.getElementById("btnSubmitNewsFormAction");

    const isEn = typeof currentLanguage !== "undefined" && currentLanguage === "en";
    const u = typeof activeUserAuth !== "undefined" && activeUserAuth ? activeUserAuth : (typeof LocalAuthStore !== "undefined" ? LocalAuthStore.getCurrentUser() : null);
    
    if (!u || !u.email) {
        window.isNewsSubmitting = false;
        if (statusMsg) {
            statusMsg.style.color = "#f87171";
            statusMsg.textContent = isEn ? "You must be logged in to submit news." : "Debes haber iniciado sesión para enviar una noticia.";
        }
        return;
    }

    const userIsAdmin = isUserAdmin(u);

    // Read Spanish inputs
    let submittedTitleEs = titleEsInput ? titleEsInput.value.trim() : "";
    let submittedSummaryEs = summaryEsInput ? summaryEsInput.value.trim() : "";
    let submittedContentEs = editorEs ? editorEs.innerHTML.trim() : "";
    const textOnlyEs = editorEs ? (editorEs.innerText || editorEs.textContent || "").trim() : "";

    // Read English inputs
    let submittedTitleEn = titleEnInput ? titleEnInput.value.trim() : "";
    let submittedSummaryEn = summaryEnInput ? summaryEnInput.value.trim() : "";
    let submittedContentEn = editorEn ? editorEn.innerHTML.trim() : "";
    const textOnlyEn = editorEn ? (editorEn.innerText || editorEn.textContent || "").trim() : "";

    // MANDATORY VALIDATION: SPANISH VERSION
    if (!submittedTitleEs) {
        window.isNewsSubmitting = false;
        switchNewsEditorLang("es");
        if (titleEsInput) titleEsInput.focus();
        if (statusMsg) {
            statusMsg.style.color = "#f87171";
            statusMsg.textContent = isEn 
                ? "⚠️ Spanish Title is required. Please write the headline in Spanish." 
                : "⚠️ El Título en Español es obligatorio. Escribe el titular en español.";
        }
        return;
    }

    if (!submittedContentEs || textOnlyEs.length === 0) {
        window.isNewsSubmitting = false;
        switchNewsEditorLang("es");
        if (editorEs) editorEs.focus();
        if (statusMsg) {
            statusMsg.style.color = "#f87171";
            statusMsg.textContent = isEn 
                ? "⚠️ Spanish Article Body is required. Please write the content in Spanish." 
                : "⚠️ El Cuerpo del Artículo en Español es obligatorio. Escribe el contenido en español.";
        }
        return;
    }

    // MANDATORY VALIDATION: ENGLISH VERSION
    if (!submittedTitleEn) {
        window.isNewsSubmitting = false;
        switchNewsEditorLang("en");
        if (titleEnInput) titleEnInput.focus();
        if (statusMsg) {
            statusMsg.style.color = "#f87171";
            statusMsg.textContent = isEn 
                ? "⚠️ English Title is required. Please write the headline in English." 
                : "⚠️ El Título en Inglés es obligatorio. Escribe el titular en inglés.";
        }
        return;
    }

    if (!submittedContentEn || textOnlyEn.length === 0) {
        window.isNewsSubmitting = false;
        switchNewsEditorLang("en");
        if (editorEn) editorEn.focus();
        if (statusMsg) {
            statusMsg.style.color = "#f87171";
            statusMsg.textContent = isEn 
                ? "⚠️ English Article Body is required. Please write the content in English." 
                : "⚠️ El Cuerpo del Artículo en Inglés es obligatorio. Escribe el contenido en inglés.";
        }
        return;
    }

    // Generate automatic summaries if empty
    if (!submittedSummaryEs) {
        submittedSummaryEs = textOnlyEs.length > 140 ? textOnlyEs.substring(0, 137) + "..." : textOnlyEs;
    }
    if (!submittedSummaryEn) {
        submittedSummaryEn = textOnlyEn.length > 140 ? textOnlyEn.substring(0, 137) + "..." : textOnlyEn;
    }

    const category = categorySelect ? categorySelect.value : "Comunidad";
    const authorName = getFfcActiveUserName() || (u.displayName || (u.email ? u.email.split("@")[0] : "Usuario FFC"));
    let imageUrl = imageInput ? imageInput.value.trim() : "";

    if (!imageUrl) {
        const defaultImages = [
            "https://images.unsplash.com/photo-1568605117036-5fe5e7bab0b7?auto=format&fit=crop&w=1200&q=80",
            "https://images.unsplash.com/photo-1511919884226-fd3cad34687c?auto=format&fit=crop&w=1200&q=80",
            "https://images.unsplash.com/photo-1580273916550-e323be2ae537?auto=format&fit=crop&w=1200&q=80"
        ];
        imageUrl = defaultImages[Math.floor(Math.random() * defaultImages.length)];
    }

    const isEditing = !!window.ffcEditingArticleId;
    const existingArticle = isEditing ? (window.ffcNewsArticles || []).find(a => a.id === window.ffcEditingArticleId) : null;

    const status = isEditing 
        ? (userIsAdmin ? (existingArticle ? existingArticle.status : "approved") : "pending")
        : (userIsAdmin ? "approved" : "pending");

    const targetId = isEditing 
        ? window.ffcEditingArticleId 
        : ("news_" + Date.now() + "_" + Math.random().toString(36).substring(2, 7));

    const articlePayload = {
        id: targetId,
        title: submittedTitleEs,
        title_en: submittedTitleEn,
        category,
        authorName: existingArticle ? (existingArticle.authorName || authorName) : authorName,
        authorEmail: existingArticle ? (existingArticle.authorEmail || u.email || "") : (u.email || ""),
        authorUid: existingArticle ? (existingArticle.authorUid || u.uid || "") : (u.uid || (userIsAdmin ? "admin_official" : "")),
        summary: submittedSummaryEs,
        summary_en: submittedSummaryEn,
        imageUrl,
        content: submittedContentEs,
        content_en: submittedContentEn,
        status,
        createdAt: existingArticle ? (existingArticle.createdAt || new Date().toISOString()) : new Date().toISOString(),
        approvedAt: (status === "approved") ? (existingArticle && existingArticle.approvedAt ? existingArticle.approvedAt : new Date().toISOString()) : null,
        commentsCount: existingArticle && typeof existingArticle.commentsCount === "number" ? existingArticle.commentsCount : 0,
        isEdited: isEditing,
        editedAt: isEditing ? new Date().toISOString() : (existingArticle && existingArticle.editedAt ? existingArticle.editedAt : null),
        editedBy: isEditing ? (u.email || authorName) : null
    };

    if (submitBtn) {
        submitBtn.disabled = true;
        submitBtn.innerHTML = isEn ? "<span>⏳</span> Saving..." : "<span>⏳</span> Guardando...";
    }
    if (statusMsg) {
        statusMsg.style.color = "#fbbf24";
        statusMsg.textContent = isEn ? "Saving bilingual article..." : "Guardando noticia bilingüe...";
    }

    try {
        // Save to Firestore
        await setDoc(doc(db, "noticias", targetId), articlePayload);

        // Clear local saved draft on successful submit
        if (!isEditing) {
            clearNewsDraft();
        }

        // Update local state and cache
        if (!window.ffcNewsArticles) window.ffcNewsArticles = [];
        const existingIdx = window.ffcNewsArticles.findIndex(a => a.id === targetId);
        if (existingIdx !== -1) {
            window.ffcNewsArticles[existingIdx] = articlePayload;
        } else {
            window.ffcNewsArticles.unshift(articlePayload);
        }
        saveCachedNewsArticles(window.ffcNewsArticles);

        renderPublicNewsSection();
        updateAdminNewsBadge();
        if (typeof renderAdminNewsTab === "function") {
            renderAdminNewsTab();
        }

        if (statusMsg) {
            statusMsg.style.color = "#34d399";
            if (isEditing) {
                if (userIsAdmin) {
                    statusMsg.textContent = isEn 
                        ? "✅ Official bilingual article updated successfully!" 
                        : "✅ ¡Artículo bilingüe actualizado y guardado correctamente!";
                } else {
                    statusMsg.textContent = isEn 
                        ? "✅ Article updated! It has been sent back to administrators for review before being published." 
                        : "✅ ¡Artículo actualizado! Se ha enviado de nuevo a los administradores para su revisión antes de volver a publicarse.";
                }
            } else {
                if (userIsAdmin) {
                    statusMsg.textContent = isEn 
                        ? "✅ Official news article published successfully in both languages!" 
                        : "✅ ¡Noticia oficial publicada con éxito en ambos idiomas!";
                } else {
                    statusMsg.textContent = isEn 
                        ? "✅ Bilingual news submitted for review! It will be published once approved by administrators." 
                        : "✅ ¡Noticia bilingüe enviada para revisión! Se publicará en el portal una vez aprobada por administradores.";
                }
            }
        }

        setTimeout(() => {
            closeSubmitNewsModal();
            if (submitBtn) {
                submitBtn.disabled = false;
                const dict = typeof translations !== "undefined" && translations[currentLanguage] ? translations[currentLanguage] : null;
                submitBtn.innerHTML = (dict && dict.news && dict.news.btnSubmitAction) 
                    ? dict.news.btnSubmitAction 
                    : (isEn ? "<span>🚀</span> Submit for Review" : "<span>🚀</span> Enviar para Revisión");
            }
        }, 1500);

    } catch (error) {
        console.error("Error saving news article to Firestore:", error);
        // Fallback: save to local state and notify
        if (!isEditing) {
            clearNewsDraft();
        }
        if (!window.ffcNewsArticles) window.ffcNewsArticles = [];
        const existingIdx = window.ffcNewsArticles.findIndex(a => a.id === targetId);
        if (existingIdx !== -1) {
            window.ffcNewsArticles[existingIdx] = articlePayload;
        } else {
            window.ffcNewsArticles.unshift(articlePayload);
        }
        saveCachedNewsArticles(window.ffcNewsArticles);
        renderPublicNewsSection();
        updateAdminNewsBadge();

        if (statusMsg) {
            statusMsg.style.color = "#34d399";
            statusMsg.textContent = isEn 
                ? "✅ Article saved locally for administrator review!" 
                : "✅ Noticia guardada localmente para revisión de los administradores.";
        }
        setTimeout(() => {
            closeSubmitNewsModal();
            if (submitBtn) {
                submitBtn.disabled = false;
                const dict = typeof translations !== "undefined" && translations[currentLanguage] ? translations[currentLanguage] : null;
                submitBtn.innerHTML = (dict && dict.news && dict.news.btnSubmitAction) 
                    ? dict.news.btnSubmitAction 
                    : (isEn ? "<span>🚀</span> Submit for Review" : "<span>🚀</span> Enviar para Revisión");
            }
        }, 1500);
    }
}

// =========================================================
// ARTICLE VIEWER & SANITIZED RICH CONTENT RENDERING
// =========================================================
function renderArticleModalContent(article, lang) {
    if (!article) return;
    const effectiveLang = lang || currentLanguage || "es";
    const isEn = effectiveLang === "en";

    const title = isEn ? (article.title_en || article.title || "") : (article.title || article.title_en || "");
    const content = isEn ? (article.content_en || article.content || "") : (article.content || article.content_en || "");

    const pill = document.getElementById("articleCategoryPill");
    const dateEl = document.getElementById("articleDate");
    const timeEl = document.getElementById("articleReadingTime");
    const titleEl = document.getElementById("articleTitle");
    const bodyEl = document.getElementById("articleBodyContent");

    if (pill) {
        pill.className = `news-cat-pill ${getNewsCategoryClass(article.category)}`;
        pill.textContent = translateNewsCategory(article.category, effectiveLang);
    }
    if (dateEl) dateEl.textContent = formatNewsDateTime(article.createdAt);
    if (timeEl) timeEl.textContent = estimateReadingTime(content);
    if (titleEl) titleEl.textContent = title;

    if (bodyEl) {
        // If content contains rich HTML tags, sanitize and render directly
        if (/<[a-z][\s\S]*>/i.test(content)) {
            // Strip scripts and risky attributes
            const cleanHtml = content
                .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, "")
                .replace(/on\w+="[^"]*"/g, "")
                .replace(/on\w+='[^']*'/g, "");
            bodyEl.innerHTML = cleanHtml;
        } else {
            // Plain text legacy format
            const paragraphs = (content || "")
                .split(/\n\n+/)
                .map(p => p.trim())
                .filter(p => p.length > 0);
            bodyEl.innerHTML = paragraphs.map(p => `<p>${p.replace(/\n/g, "<br>")}</p>`).join("");
        }
    }
}

function openNewsArticleModal(articleId) {
    const overlay = document.getElementById("newsArticleModalOverlay");
    if (!overlay) return;

    const article = window.ffcNewsArticles.find(a => a.id === articleId);
    if (!article) return;

    window.ffcActiveReadingArticle = article;

    // Elements
    const initialEl = document.getElementById("articleAuthorInitial");
    const authorNameEl = document.getElementById("articleAuthorName");
    const badgeEl = document.getElementById("articleAuthorBadge");
    const imgEl = document.getElementById("articleImage");
    const commentsCountText = document.getElementById("articleCommentsCountText");
    const commentsTotalBadge = document.getElementById("newsCommentsTotalBadge");
    const commentAuthorInput = document.getElementById("newsCommentAuthorInput");

    // Render language-sensitive content according to the website's active language
    renderArticleModalContent(article, currentLanguage);

    if (initialEl) initialEl.textContent = (article.authorName || "F").charAt(0).toUpperCase();
    if (authorNameEl) authorNameEl.textContent = article.authorName || (currentLanguage === "en" ? "Anonymous" : "Anónimo");
    if (badgeEl) {
        const isOfficial = article.authorUid === "admin_official" || (article.authorEmail && ADMIN_EMAILS.includes(article.authorEmail.toLowerCase()));
        badgeEl.style.display = isOfficial ? "inline-block" : "none";
        badgeEl.textContent = isOfficial ? (currentLanguage === "en" ? "OFFICIAL FFC" : "OFICIAL FFC") : "";
    }

    if (imgEl) {
        if (article.imageUrl) {
            imgEl.src = encodeURI(article.imageUrl);
            imgEl.style.display = "block";
        } else {
            imgEl.style.display = "none";
        }
    }

    const count = typeof article.commentsCount === "number" ? article.commentsCount : 0;
    if (commentsCountText) {
        const commentWord = currentLanguage === "en" ? (count === 1 ? "comment" : "comments") : (count === 1 ? "comentario" : "comentarios");
        commentsCountText.textContent = `${count} ${commentWord}`;
    }
    if (commentsTotalBadge) commentsTotalBadge.textContent = count;

    // Prefill comment author input if user is signed in
    const u = typeof activeUserAuth !== "undefined" && activeUserAuth ? activeUserAuth : (typeof LocalAuthStore !== "undefined" ? LocalAuthStore.getCurrentUser() : null);
    if (commentAuthorInput && u) {
        commentAuthorInput.value = u.displayName || (u.email ? u.email.split("@")[0] : "");
    }

    // Check edit permissions for current user
    const userIsAdmin = isUserAdmin(u);
    const activeName = getFfcActiveUserName();
    const isAuthor = u && (
        (u.email && article.authorEmail && u.email.toLowerCase() === article.authorEmail.toLowerCase()) ||
        (u.uid && article.authorUid && u.uid === article.authorUid) ||
        (activeName && article.authorName && activeName.toLowerCase() === article.authorName.toLowerCase()) ||
        (u.displayName && article.authorName && u.displayName.toLowerCase() === article.authorName.toLowerCase())
    );
    const canEdit = userIsAdmin || isAuthor;

    const btnEditCurrentArticle = document.getElementById("btnEditCurrentArticle");
    const btnEditCurrentArticleText = document.getElementById("btnEditCurrentArticleText");
    if (btnEditCurrentArticle) {
        if (canEdit) {
            btnEditCurrentArticle.style.display = "inline-flex";
            if (btnEditCurrentArticleText) {
                btnEditCurrentArticleText.textContent = currentLanguage === "en" ? "Edit Article" : "Editar Noticia";
            }
            btnEditCurrentArticle.onclick = () => {
                closeNewsArticleModal();
                openEditNewsArticleModal(article.id);
            };
        } else {
            btnEditCurrentArticle.style.display = "none";
        }
    }

    // Admin Quick Actions Bar inside Reader Modal
    const adminBar = document.getElementById("articleAdminActionsBar");
    const adminBtnsContainer = document.getElementById("articleAdminActionBtns");

    if (adminBar && adminBtnsContainer) {
        if (userIsAdmin) {
            adminBar.style.display = "flex";
            const approveBtnHtml = article.status !== "approved"
                ? `<button type="button" class="btn-action-approve" id="modalBtnApproveNews" title="Aprobar y publicar">✅ Aprobar Noticia</button>`
                : ``;
            const rejectBtnHtml = article.status !== "rejected"
                ? `<button type="button" class="btn-action-reject" id="modalBtnRejectNews" title="Rechazar noticia">❌ Rechazar</button>`
                : ``;

            adminBtnsContainer.innerHTML = `
                <button type="button" class="btn-action-edit" id="modalBtnEditNewsAdmin" title="Editar campos del artículo">✏️ Editar Noticia</button>
                ${approveBtnHtml}
                ${rejectBtnHtml}
                <button type="button" class="btn-action-delete" id="modalBtnDeleteNews" title="Eliminar noticia">🗑️ Eliminar Noticia</button>
            `;

            const btnEditAdmin = document.getElementById("modalBtnEditNewsAdmin");
            if (btnEditAdmin) {
                btnEditAdmin.addEventListener("click", () => {
                    closeNewsArticleModal();
                    openEditNewsArticleModal(article.id);
                });
            }

            const btnApprove = document.getElementById("modalBtnApproveNews");
            if (btnApprove) {
                btnApprove.addEventListener("click", () => {
                    approveNewsArticle(article.id);
                    openNewsArticleModal(article.id);
                });
            }

            const btnReject = document.getElementById("modalBtnRejectNews");
            if (btnReject) {
                btnReject.addEventListener("click", () => {
                    rejectNewsArticle(article.id);
                    openNewsArticleModal(article.id);
                });
            }

            const btnDelete = document.getElementById("modalBtnDeleteNews");
            if (btnDelete) {
                btnDelete.addEventListener("click", (e) => {
                    e.preventDefault();
                    if (btnDelete.classList.contains("confirming")) {
                        btnDelete.innerHTML = currentLanguage === "en" ? "<span>⏳</span> Deleting..." : "<span>⏳</span> Eliminando...";
                        btnDelete.disabled = true;
                        deleteNewsArticle(article.id);
                        closeNewsArticleModal();
                    } else {
                        btnDelete.classList.add("confirming");
                        btnDelete.innerHTML = currentLanguage === "en" ? "⚠️ Click again to delete" : "⚠️ Clic de nuevo para eliminar";
                        setTimeout(() => {
                            if (btnDelete && btnDelete.classList.contains("confirming")) {
                                btnDelete.classList.remove("confirming");
                                btnDelete.innerHTML = "🗑️ Eliminar Noticia";
                            }
                        }, 3500);
                    }
                });
            }
        } else {
            adminBar.style.display = "none";
            adminBtnsContainer.innerHTML = "";
        }
    }

    // Load & listen to comments
    loadArticleComments(article.id);

    overlay.classList.add("active");
    overlay.style.display = "flex";
    overlay.style.opacity = "1";
    overlay.style.visibility = "visible";
    overlay.setAttribute("aria-hidden", "false");
    document.body.classList.add("modal-open");
}

function closeNewsArticleModal() {
    const overlay = document.getElementById("newsArticleModalOverlay");
    if (!overlay) return;
    if (commentsUnsubscribe) {
        try { commentsUnsubscribe(); } catch(e){}
        commentsUnsubscribe = null;
    }
    window.ffcActiveReadingArticle = null;
    overlay.classList.remove("active");
    overlay.style.display = "none";
    overlay.style.opacity = "0";
    overlay.style.visibility = "hidden";
    overlay.setAttribute("aria-hidden", "true");
    document.body.classList.remove("modal-open");
}

// Load and Render Comments for Active Article
function loadArticleComments(newsId) {
    const commentsContainer = document.getElementById("newsCommentsList");
    if (!commentsContainer) return;

    // Initial render from local cache
    const cachedComments = loadCachedComments(newsId);
    renderCommentsList(cachedComments, newsId);

    // Detach previous comments listener if active
    if (commentsUnsubscribe) {
        try { commentsUnsubscribe(); } catch(e){}
        commentsUnsubscribe = null;
    }

    // Firestore listener for comments
    try {
        const commentsCol = collection(db, "noticias_comentarios");
        const q = query(commentsCol, where("newsId", "==", newsId));
        commentsUnsubscribe = onSnapshot(q, (snapshot) => {
            const commentMap = new Map();
            snapshot.forEach(docSnap => {
                const data = docSnap.data();
                const cid = docSnap.id || data.id;
                if (cid) {
                    commentMap.set(cid, {
                        id: cid,
                        ...data
                    });
                }
            });

            const comments = Array.from(commentMap.values());

            // Sort ascending by createdAt
            comments.sort((a, b) => new Date(a.createdAt || 0) - new Date(b.createdAt || 0));
            saveCachedComments(newsId, comments);
            renderCommentsList(comments, newsId);

            const exactCount = comments.length;

            // Update comment count on active article modal
            const commentsCountText = document.getElementById("articleCommentsCountText");
            const commentsTotalBadge = document.getElementById("newsCommentsTotalBadge");
            if (commentsCountText) {
                const commentWord = currentLanguage === "en" ? (exactCount === 1 ? "comment" : "comments") : (exactCount === 1 ? "comentario" : "comentarios");
                commentsCountText.textContent = `${exactCount} ${commentWord}`;
            }
            if (commentsTotalBadge) commentsTotalBadge.textContent = exactCount;

            // Also sync count with main article object in memory & cache
            const art = window.ffcNewsArticles.find(a => a.id === newsId);
            if (art) {
                art.commentsCount = exactCount;
                saveCachedNewsArticles(window.ffcNewsArticles);
                renderPublicNewsSection();
            }

            // Sync doc count in Firestore if needed
            try {
                updateDoc(doc(db, "noticias", newsId), { commentsCount: exactCount });
            } catch(e){}

        }, (err) => {
            console.warn("Error streaming comments:", err);
        });
    } catch (e) {
        console.warn("Could not query comments in Firestore:", e);
    }
}

function renderCommentsList(comments, newsId) {
    const container = document.getElementById("newsCommentsList");
    if (!container) return;

    const noCommentsMsg = currentLanguage === "en" 
        ? "No comments yet. Be the first to comment on this news article!"
        : "No hay comentarios todavía. ¡Sé el primero en opinar sobre esta noticia!";

    if (!comments || comments.length === 0) {
        container.innerHTML = `<div class="news-no-comments">${noCommentsMsg}</div>`;
        return;
    }

    const u = typeof activeUserAuth !== "undefined" && activeUserAuth ? activeUserAuth : (typeof LocalAuthStore !== "undefined" ? LocalAuthStore.getCurrentUser() : null);
    const userIsAdmin = isUserAdmin(u);
    const authorFallback = currentLanguage === "en" ? "Anonymous" : "Anónimo";
    const deleteTitle = currentLanguage === "en" ? "Delete comment" : "Eliminar comentario";

    container.innerHTML = comments.map(c => {
        const initial = (c.authorName || "U").charAt(0).toUpperCase();
        const dateFormatted = formatNewsDateTime(c.createdAt);
        const canDelete = userIsAdmin || (u && u.email && c.authorEmail && u.email.toLowerCase() === c.authorEmail.toLowerCase());

        const deleteBtnMarkup = canDelete 
            ? `<button type="button" class="btn-delete-comment" data-comment-id="${c.id}" data-news-id="${newsId}" title="${deleteTitle}">🗑️</button>` 
            : ``;

        return `
            <div class="news-comment-item" id="comment_${c.id}">
                <div class="news-comment-avatar">${initial}</div>
                <div class="news-comment-content">
                    <div class="news-comment-top">
                        <div style="display: flex; align-items: center; gap: 8px;">
                            <span class="news-comment-author-name">${c.authorName || authorFallback}</span>
                            <span class="news-comment-date">${dateFormatted}</span>
                        </div>
                        ${deleteBtnMarkup}
                    </div>
                    <div class="news-comment-text">${c.text || ""}</div>
                </div>
            </div>
        `;
    }).join("");

    // Bind delete buttons with 2-step confirm
    container.querySelectorAll(".btn-delete-comment").forEach(btn => {
        btn.addEventListener("click", () => {
            const commentId = btn.dataset.commentId;
            const nId = btn.dataset.newsId;
            if (!btn.dataset.confirming) {
                btn.dataset.confirming = "true";
                btn.textContent = "⚠️ ¿Borrar?";
                btn.style.color = "#f87171";
                btn.style.fontSize = "11px";
                setTimeout(() => {
                    if (btn && btn.dataset.confirming === "true") {
                        delete btn.dataset.confirming;
                        btn.textContent = "🗑️";
                        btn.style.color = "";
                        btn.style.fontSize = "";
                    }
                }, 3500);
            } else {
                btn.disabled = true;
                btn.textContent = "⏳";
                deleteNewsComment(commentId, nId);
            }
        });
    });
}

async function handleCommentSubmit(e) {
    e.preventDefault();
    if (!window.ffcActiveReadingArticle) return;

    const newsId = window.ffcActiveReadingArticle.id;
    const authorInput = document.getElementById("newsCommentAuthorInput");
    const textInput = document.getElementById("newsCommentTextInput");
    const statusMsg = document.getElementById("commentStatusMsg");
    const submitBtn = document.getElementById("btnSubmitComment");

    const authorName = authorInput ? authorInput.value.trim() : "";
    const text = textInput ? textInput.value.trim() : "";

    if (!authorName || !text) {
        if (statusMsg) {
            statusMsg.style.color = "#f87171";
            statusMsg.textContent = "Ingresa tu nombre y tu comentario.";
        }
        return;
    }

    const u = typeof activeUserAuth !== "undefined" && activeUserAuth ? activeUserAuth : (typeof LocalAuthStore !== "undefined" ? LocalAuthStore.getCurrentUser() : null);
    const commentId = "cmt_" + Date.now() + "_" + Math.random().toString(36).substring(2, 7);

    const commentPayload = {
        id: commentId,
        newsId: newsId,
        authorName,
        authorEmail: u && u.email ? u.email : "",
        authorUid: u && u.uid ? u.uid : "",
        text,
        createdAt: new Date().toISOString()
    };

    if (submitBtn) {
        submitBtn.disabled = true;
    }
    if (statusMsg) {
        statusMsg.style.color = "#fbbf24";
        statusMsg.textContent = "Publicando...";
    }

    try {
        await setDoc(doc(db, "noticias_comentarios", commentId), commentPayload);

        if (textInput) textInput.value = "";
        if (statusMsg) {
            statusMsg.style.color = "#34d399";
            statusMsg.textContent = "¡Comentario publicado!";
            setTimeout(() => {
                if (statusMsg) statusMsg.textContent = "";
            }, 2500);
        }

    } catch (err) {
        console.error("Error publishing comment to Firestore:", err);
        // Fallback local save
        const currentComments = loadCachedComments(newsId);
        const newComments = [...currentComments, commentPayload];
        saveCachedComments(newsId, newComments);
        renderCommentsList(newComments, newsId);

        if (textInput) textInput.value = "";
        if (statusMsg) {
            statusMsg.style.color = "#34d399";
            statusMsg.textContent = "Comentario guardado localmente.";
        }
    } finally {
        if (submitBtn) submitBtn.disabled = false;
    }
}

async function deleteNewsComment(commentId, newsId) {
    try {
        await deleteDoc(doc(db, "noticias_comentarios", commentId));
    } catch (err) {
        console.warn("Could not delete comment in Firestore:", err);
    }

    // Remove from local cache
    const currentComments = loadCachedComments(newsId);
    const updated = currentComments.filter(c => c.id !== commentId);
    saveCachedComments(newsId, updated);
    renderCommentsList(updated, newsId);

    // Update article count
    const art = window.ffcNewsArticles.find(a => a.id === newsId);
    if (art) {
        art.commentsCount = Math.max(0, updated.length);
        saveCachedNewsArticles(window.ffcNewsArticles);
        try {
            await updateDoc(doc(db, "noticias", newsId), {
                commentsCount: updated.length
            });
        } catch(e){}
    }
    renderPublicNewsSection();
}

function handleShareArticleLink() {
    if (!window.ffcActiveReadingArticle) return;
    const shareUrl = window.location.origin + window.location.pathname + "#news";
    navigator.clipboard.writeText(shareUrl).then(() => {
        const btn = document.getElementById("btnShareArticleLink");
        if (btn) {
            const originalText = btn.innerHTML;
            btn.innerHTML = "✅ ¡Enlace copiado!";
            setTimeout(() => {
                btn.innerHTML = originalText;
            }, 2000);
        }
    }).catch(() => {
        alert("Enlace para compartir: " + shareUrl);
    });
}

// =========================================================
// ADMIN MODERATION TAB LOGIC
// =========================================================
function renderAdminNewsTab() {
    const list = document.getElementById("adminNewsList");
    if (!list) return;

    updateAdminNewsBadge();

    const allArticles = window.ffcNewsArticles || [];
    let filtered = [...allArticles];

    // Filter by tab
    if (window.ffcAdminNewsFilter && window.ffcAdminNewsFilter !== "all") {
        filtered = filtered.filter(a => a.status === window.ffcAdminNewsFilter);
    }

    // Search query
    if (window.ffcAdminNewsSearchQuery && window.ffcAdminNewsSearchQuery.trim()) {
        const q = window.ffcAdminNewsSearchQuery.trim().toLowerCase();
        filtered = filtered.filter(a => 
            (a.title && a.title.toLowerCase().includes(q)) ||
            (a.authorName && a.authorName.toLowerCase().includes(q)) ||
            (a.summary && a.summary.toLowerCase().includes(q)) ||
            (a.category && a.category.toLowerCase().includes(q))
        );
    }

    if (filtered.length === 0) {
        list.innerHTML = `
            <div style="text-align: center; padding: 40px 20px; background: rgba(255, 255, 255, 0.02); border: 1px dashed rgba(255, 255, 255, 0.1); border-radius: 8px; color: #a0aec0;">
                <p style="font-size: 15px; margin-bottom: 6px;">No se encontraron noticias en esta categoría.</p>
                <span style="font-size: 13px; color: #718096;">Cuando los miembros de la comunidad envíen artículos, aparecerán aquí para tu aprobación.</span>
            </div>
        `;
        return;
    }

    list.innerHTML = filtered.map(article => {
        const dateFormatted = formatNewsDateTime(article.createdAt);
        let statusPillMarkup = "";
        if (article.status === "approved") {
            statusPillMarkup = `<span class="admin-news-status-pill status-approved">🟢 APROBADA Y PUBLICADA</span>`;
        } else if (article.status === "rejected") {
            statusPillMarkup = `<span class="admin-news-status-pill status-rejected">🔴 RECHAZADA</span>`;
        } else {
            statusPillMarkup = `<span class="admin-news-status-pill status-pending">🟡 PENDIENTE DE REVISIÓN</span>`;
        }

        const editedPillMarkup = article.isEdited
            ? `<span class="admin-news-status-pill status-edited" title="Artículo editado el ${article.editedAt ? formatNewsDateTime(article.editedAt) : ''}">✏️ EDITADO</span>`
            : ``;

        const approveBtnMarkup = article.status !== "approved"
            ? `<button type="button" class="btn-action-approve" data-news-id="${article.id}" title="Aprobar y publicar en la web">✅ Aprobar</button>`
            : ``;

        const rejectBtnMarkup = article.status !== "rejected"
            ? `<button type="button" class="btn-action-reject" data-news-id="${article.id}" title="Rechazar noticia">❌ Rechazar</button>`
            : ``;

        return `
            <div class="admin-news-item-card" id="admin_news_${article.id}">
                <div class="admin-news-item-top">
                    <div style="display: flex; align-items: center; gap: 10px; flex-wrap: wrap;">
                        ${statusPillMarkup}
                        ${editedPillMarkup}
                        <span class="news-cat-pill ${getNewsCategoryClass(article.category)}">${article.category || "Comunidad"}</span>
                    </div>
                    <div class="admin-news-meta-info">
                        <span>📅 ${dateFormatted}</span>
                        <span>&bull;</span>
                        <span>💬 ${article.commentsCount || 0} comentarios</span>
                    </div>
                </div>

                <div>
                    <h4 class="admin-news-item-title">${article.title}</h4>
                    <p class="admin-news-item-summary">${article.summary || ""}</p>
                </div>

                <div class="admin-news-item-bottom">
                    <div class="admin-news-author-detail">
                        <span>✍️ <strong>${article.authorName || "Anónimo"}</strong></span>
                        ${article.authorEmail ? ` &bull; <span style="color: #94a3b8;">${article.authorEmail}</span>` : ""}
                    </div>

                    <div class="admin-news-action-buttons">
                        <button type="button" class="btn-action-preview" data-news-id="${article.id}" title="Ver contenido completo y comentarios">👁️ Leer / Ver</button>
                        <button type="button" class="btn-action-edit" data-news-id="${article.id}" title="Editar artículo">✏️ Editar</button>
                        ${approveBtnMarkup}
                        ${rejectBtnMarkup}
                        <button type="button" class="btn-action-delete" data-news-id="${article.id}" title="Eliminar definitivamente">🗑️ Eliminar</button>
                    </div>
                </div>
            </div>
        `;
    }).join("");

    // Bind Admin Actions
    list.querySelectorAll(".btn-action-preview").forEach(btn => {
        btn.addEventListener("click", () => {
            const id = btn.dataset.newsId;
            openNewsArticleModal(id);
        });
    });

    list.querySelectorAll(".btn-action-edit").forEach(btn => {
        btn.addEventListener("click", () => {
            const id = btn.dataset.newsId;
            openEditNewsArticleModal(id);
        });
    });

    list.querySelectorAll(".btn-action-approve").forEach(btn => {
        btn.addEventListener("click", () => {
            const id = btn.dataset.newsId;
            approveNewsArticle(id);
        });
    });

    list.querySelectorAll(".btn-action-reject").forEach(btn => {
        btn.addEventListener("click", () => {
            const id = btn.dataset.newsId;
            rejectNewsArticle(id);
        });
    });

    list.querySelectorAll(".btn-action-delete").forEach(btn => {
        btn.addEventListener("click", (e) => {
            e.preventDefault();
            e.stopPropagation();
            const id = btn.dataset.newsId;
            if (!id) return;

            if (btn.classList.contains("confirming")) {
                btn.innerHTML = currentLanguage === "en" ? "<span>⏳</span> Deleting..." : "<span>⏳</span> Eliminando...";
                btn.disabled = true;
                deleteNewsArticle(id);
            } else {
                btn.classList.add("confirming");
                btn.innerHTML = currentLanguage === "en" ? "⚠️ Confirm delete?" : "⚠️ ¿Confirmar eliminar?";
                btn.title = currentLanguage === "en" ? "Click again to confirm deletion" : "Haz clic de nuevo para confirmar la eliminación";
                setTimeout(() => {
                    if (btn && btn.classList.contains("confirming")) {
                        btn.classList.remove("confirming");
                        btn.innerHTML = "🗑️ Eliminar";
                        btn.title = currentLanguage === "en" ? "Delete permanently" : "Eliminar definitivamente";
                    }
                }, 3500);
            }
        });
    });
}

// Admin Action: Approve News Article
async function approveNewsArticle(newsId) {
    const article = window.ffcNewsArticles.find(a => a.id === newsId);
    if (!article) return;

    article.status = "approved";
    article.approvedAt = new Date().toISOString();

    saveCachedNewsArticles(window.ffcNewsArticles);
    renderAdminNewsTab();
    renderPublicNewsSection();
    updateAdminNewsBadge();

    try {
        await updateDoc(doc(db, "noticias", newsId), {
            status: "approved",
            approvedAt: article.approvedAt
        });
    } catch (err) {
        console.warn("Could not approve article in Firestore:", err);
    }
}

// Admin Action: Reject News Article
async function rejectNewsArticle(newsId) {
    const article = window.ffcNewsArticles.find(a => a.id === newsId);
    if (!article) return;

    article.status = "rejected";

    saveCachedNewsArticles(window.ffcNewsArticles);
    renderAdminNewsTab();
    renderPublicNewsSection();
    updateAdminNewsBadge();

    try {
        await updateDoc(doc(db, "noticias", newsId), {
            status: "rejected"
        });
    } catch (err) {
        console.warn("Could not reject article in Firestore:", err);
    }
}

// Admin Action: Delete News Article
async function deleteNewsArticle(newsId) {
    if (!newsId) return;

    // Optimistically update memory and localStorage cache immediately
    window.ffcNewsArticles = window.ffcNewsArticles.filter(a => a.id !== newsId);
    saveCachedNewsArticles(window.ffcNewsArticles);
    try {
        localStorage.removeItem("ffc_news_comments_" + newsId);
    } catch(e){}

    renderAdminNewsTab();
    renderPublicNewsSection();
    updateAdminNewsBadge();

    // Close reading modal if this article was currently open
    if (window.ffcActiveReadingArticle && window.ffcActiveReadingArticle.id === newsId) {
        closeNewsArticleModal();
    }

    try {
        await deleteDoc(doc(db, "noticias", newsId));

        // Also delete all associated comments in Firestore
        try {
            const commentsRef = collection(db, "noticias_comentarios");
            const q = query(commentsRef, where("newsId", "==", newsId));
            const cmtSnapshot = await getDocs(q);
            const batch = writeBatch(db);
            cmtSnapshot.forEach(docSnap => {
                batch.delete(docSnap.ref);
            });
            await batch.commit();
        } catch(cErr) {
            console.warn("Could not clean up article comments in Firestore:", cErr);
        }
    } catch (err) {
        console.warn("Could not delete article in Firestore:", err);
    }
}

// Direct Admin Create Official News
function handleAdminCreateOfficialNews() {
    openSubmitNewsModal("Carreras");
    const titleInput = document.getElementById("newsSubmitTitle");
    const authorInput = document.getElementById("newsSubmitAuthor");
    if (titleInput) titleInput.value = "COMUNICADO OFICIAL: ";
    if (authorInput) authorInput.value = "Comisaría Oficial FFC";
}

// =========================================================
// EVENT LISTENERS & INITIALIZATION
// =========================================================
function initNewsSystemEvents() {
    if (window._ffcNewsEventsInit) return;
    window._ffcNewsEventsInit = true;

    // 1. Open / Close Submit Modal
    const openSubmitBtn = document.getElementById("btnOpenSubmitNewsModal");
    const closeSubmitBtn = document.getElementById("newsSubmitModalClose");
    const cancelSubmitBtn = document.getElementById("newsSubmitCancelBtn");
    const submitOverlay = document.getElementById("newsSubmitModalOverlay");
    const submitForm = document.getElementById("newsSubmitForm");
    const defaultImgBtn = document.getElementById("btnNewsUseDefaultImg");

    if (openSubmitBtn) {
        openSubmitBtn.addEventListener("click", () => openSubmitNewsModal());
    }
    if (closeSubmitBtn) {
        closeSubmitBtn.addEventListener("click", closeSubmitNewsModal);
    }
    if (cancelSubmitBtn) {
        cancelSubmitBtn.addEventListener("click", closeSubmitNewsModal);
    }
    if (submitOverlay) {
        submitOverlay.addEventListener("click", (e) => {
            if (e.target === submitOverlay) closeSubmitNewsModal();
        });
    }
    if (submitForm) {
        submitForm.addEventListener("submit", handleNewsFormSubmit);
    }
    if (defaultImgBtn) {
        defaultImgBtn.addEventListener("click", setPresetNewsImage);
    }

    // 2. Open / Close Article Viewer Modal
    const closeArticleBtn = document.getElementById("newsArticleModalClose");
    const articleOverlay = document.getElementById("newsArticleModalOverlay");
    const commentForm = document.getElementById("newsAddCommentForm");
    const shareLinkBtn = document.getElementById("btnShareArticleLink");

    if (closeArticleBtn) {
        closeArticleBtn.addEventListener("click", closeNewsArticleModal);
    }
    if (articleOverlay) {
        articleOverlay.addEventListener("click", (e) => {
            if (e.target === articleOverlay) closeNewsArticleModal();
        });
    }
    if (commentForm) {
        commentForm.addEventListener("submit", handleCommentSubmit);
    }
    if (shareLinkBtn) {
        shareLinkBtn.addEventListener("click", handleShareArticleLink);
    }

    // 3. Category Filter Buttons
    const categoryFilterBtns = document.querySelectorAll("#newsCategoryFilters .news-cat-btn");
    categoryFilterBtns.forEach(btn => {
        btn.addEventListener("click", () => {
            categoryFilterBtns.forEach(b => b.classList.remove("active"));
            btn.classList.add("active");
            window.ffcNewsActiveCategory = btn.dataset.cat || "all";
            renderPublicNewsSection();
        });
    });

    // 4. Search Input
    const searchInput = document.getElementById("newsSearchInput");
    const clearSearchBtn = document.getElementById("newsClearSearchBtn");
    const resetFiltersBtn = document.getElementById("btnResetNewsFilters");

    if (searchInput) {
        searchInput.addEventListener("input", (e) => {
            window.ffcNewsSearchQuery = e.target.value;
            if (clearSearchBtn) {
                clearSearchBtn.style.display = e.target.value ? "block" : "none";
            }
            renderPublicNewsSection();
        });
    }

    if (clearSearchBtn) {
        clearSearchBtn.addEventListener("click", () => {
            if (searchInput) searchInput.value = "";
            window.ffcNewsSearchQuery = "";
            clearSearchBtn.style.display = "none";
            renderPublicNewsSection();
        });
    }

    if (resetFiltersBtn) {
        resetFiltersBtn.addEventListener("click", () => {
            categoryFilterBtns.forEach(b => b.classList.remove("active"));
            const allBtn = document.querySelector('#newsCategoryFilters [data-cat="all"]');
            if (allBtn) allBtn.classList.add("active");
            window.ffcNewsActiveCategory = "all";
            if (searchInput) searchInput.value = "";
            window.ffcNewsSearchQuery = "";
            if (clearSearchBtn) clearSearchBtn.style.display = "none";
            renderPublicNewsSection();
        });
    }

    // 5. Admin News Toolbar Filters
    const adminNewsFilterBtns = document.querySelectorAll(".admin-news-filter-btn");
    adminNewsFilterBtns.forEach(btn => {
        btn.addEventListener("click", () => {
            adminNewsFilterBtns.forEach(b => b.classList.remove("active"));
            btn.classList.add("active");
            window.ffcAdminNewsFilter = btn.dataset.filter || "all";
            renderAdminNewsTab();
        });
    });

    const adminNewsSearchInput = document.getElementById("adminNewsSearchInput");
    if (adminNewsSearchInput) {
        adminNewsSearchInput.addEventListener("input", (e) => {
            window.ffcAdminNewsSearchQuery = e.target.value;
            renderAdminNewsTab();
        });
    }

    const btnAdminCreateOfficialNews = document.getElementById("btnAdminCreateOfficialNews");
    if (btnAdminCreateOfficialNews) {
        btnAdminCreateOfficialNews.addEventListener("click", handleAdminCreateOfficialNews);
    }
}

// Expose News modal and admin functions to window
window.openSubmitNewsModal = openSubmitNewsModal;
window.closeSubmitNewsModal = closeSubmitNewsModal;
window.openNewsArticleModal = openNewsArticleModal;
window.closeNewsArticleModal = closeNewsArticleModal;
window.setPresetNewsImage = setPresetNewsImage;
window.handleNewsFormSubmit = handleNewsFormSubmit;
window.renderPublicNewsSection = renderPublicNewsSection;
window.deleteNewsArticle = deleteNewsArticle;
window.approveNewsArticle = approveNewsArticle;
window.rejectNewsArticle = rejectNewsArticle;
window.renderAdminNewsTab = renderAdminNewsTab;

// Global initialization
if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", () => {
        initNewsRealtimeSync();
        initNewsSystemEvents();
        if (typeof lucide !== 'undefined' && lucide.createIcons) {
            lucide.createIcons();
        }
    });
} else {
    initNewsRealtimeSync();
    initNewsSystemEvents();
    if (typeof lucide !== 'undefined' && lucide.createIcons) {
        lucide.createIcons();
    }
}





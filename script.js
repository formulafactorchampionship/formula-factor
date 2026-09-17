/* =========================================================
   FIREBASE FIRESTORE SETUP (MODULAR SDK v10 VIA CDN)
========================================================= */

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
    where
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

function getPilotDocId(driverName) {
    if (!driverName) return "pilot_" + Date.now();
    return driverName.trim().toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9_-]/g, '_') || ("pilot_" + Date.now());
}

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
    if (currentNextRace && currentNextRace.dateTime) {
        const parsed = getMadridEpochMs(currentNextRace.dateTime);
        if (!isNaN(parsed)) return parsed;
    }
    return getMadridEpochMs("2026-09-20T16:30");
}

let raceDate = getSavedRaceTimestamp();

function updateCountdown() {

    const now = Date.now();
    const difference = raceDate - now;

    const daysEl = document.getElementById("days");
    const hoursEl = document.getElementById("hours");
    const minsEl = document.getElementById("mins");
    const secsEl = document.getElementById("secs");

    if (!daysEl || !hoursEl || !minsEl || !secsEl) return;

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
            info: "INFORMACIÓN"
        },
        hero: {
            eyebrow: "TEMPORADA 1 · FORMULA FACTOR CHAMPIONSHIP",
            title: "CORRE<br>RUEDA A<br>RUEDA<br>EN LA PARRILLA<br>FORMULA<br>FACTOR",
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
            btnCalendar: "VER CALENDARIO"
        },
        nextRace: {
            cardTop: "PRÓXIMA CARRERA",
            nextLabel: "SIGUIENTE RONDA",
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
            disclaimer: "Aviso: Es imprescindible estar en el servidor de Discord para estar al día de los cambios y poder unirse a un equipo.",
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
        }
    },
    en: {
        nav: {
            home: "HOME",
            standings: "STANDINGS",
            calendar: "CALENDAR",
            races: "RACES",
            info: "INFO"
        },
        hero: {
            eyebrow: "SEASON 1 · FORMULA FACTOR CHAMPIONSHIP",
            title: "RACE<br>WHEEL-TO-<br>WHEEL<br>ON THE<br>FORMULA<br>FACTOR GRID",
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
            btnCalendar: "VIEW CALENDAR"
        },
        nextRace: {
            cardTop: "NEXT RACE",
            nextLabel: "NEXT ROUND",
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
            disclaimer: "Disclaimer: You need to be on the Discord server to stay updated on changes and to be able to join a team.",
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
        }
    }
};

let currentLanguage = "es";

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
    const navI = document.getElementById("navInfo");
    if (navI) navI.textContent = dict.nav.info;

    // Hero
    const heroEye = document.getElementById("heroEyebrow");
    if (heroEye) heroEye.textContent = dict.hero.eyebrow;
    const heroT = document.getElementById("heroTitle");
    if (heroT) heroT.innerHTML = dict.hero.title;
    const heroD = document.getElementById("heroDescription");
    if (heroD) heroD.textContent = dict.hero.description;
    const heroBS = document.getElementById("heroBtnStandings");
    if (heroBS) heroBS.textContent = dict.hero.btnStandings;
    const heroBC = document.getElementById("heroBtnCalendar");
    if (heroBC) heroBC.textContent = dict.hero.btnCalendar;

    // Live Stream Hero
    if (dict.live) {
        const liveBadge = document.getElementById("liveStatusBadge");
        if (liveBadge) liveBadge.textContent = dict.live.badge;
        const twitchBtnLabel = document.getElementById("twitchBtnLabel");
        if (twitchBtnLabel) twitchBtnLabel.textContent = dict.live.watchOnTwitch;
        const heroLiveBtnStandings = document.getElementById("heroLiveBtnStandings");
        if (heroLiveBtnStandings) heroLiveBtnStandings.textContent = dict.live.btnStandings;
        const heroLiveBtnCalendar = document.getElementById("heroLiveBtnCalendar");
        if (heroLiveBtnCalendar) heroLiveBtnCalendar.textContent = dict.live.btnCalendar;
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
    const inDisc = document.getElementById("infoDisclaimer");
    if (inDisc) inDisc.textContent = dict.info.disclaimer;
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

    // Timezone Dropdown Texts
    const tzTitleEl = document.getElementById("tzMenuTitle");
    if (tzTitleEl && dict.tz) tzTitleEl.textContent = dict.tz.title;
    const tzDescEl = document.getElementById("tzMenuDesc");
    if (tzDescEl && dict.tz) tzDescEl.textContent = dict.tz.desc;
    const tzBtnEl = document.getElementById("tzDropdownBtn");
    if (tzBtnEl && dict.tz) tzBtnEl.setAttribute("title", dict.tz.btnTitle);

    // User Auth translations
    if (dict.auth) {
        const authBtnLabelEl = document.getElementById("authBtnLabel");
        if (authBtnLabelEl && !authBtnLabelEl.dataset.customName) {
            authBtnLabelEl.textContent = dict.auth.btnLabel;
        }
        const authBadgeEl = document.getElementById("authCardBadge");
        if (authBadgeEl) authBadgeEl.textContent = dict.auth.badge;
        const tabLog = document.getElementById("authTabLogin");
        if (tabLog) tabLog.textContent = dict.auth.tabLogin;
        const tabReg = document.getElementById("authTabRegister");
        if (tabReg) tabReg.textContent = dict.auth.tabRegister;
        const logSub = document.getElementById("authLoginSub");
        if (logSub) logSub.textContent = dict.auth.loginSub;
        const regSub = document.getElementById("authRegisterSub");
        if (regSub) regSub.textContent = dict.auth.registerSub;
        const resSub = document.getElementById("authResetSub");
        if (resSub) resSub.textContent = dict.auth.resetSub;
        const forgotLink = document.getElementById("authForgotBtn");
        if (forgotLink) forgotLink.textContent = dict.auth.forgotLink;
        const logCancel = document.getElementById("loginCancelBtn");
        if (logCancel) logCancel.textContent = dict.auth.btnCancel;
        const regCancel = document.getElementById("registerCancelBtn");
        if (regCancel) regCancel.textContent = dict.auth.btnCancel;
        const resBack = document.getElementById("resetBackBtn");
        if (resBack) resBack.textContent = dict.auth.btnBack;
        const logSubBtn = document.getElementById("loginSubmitBtn");
        if (logSubBtn && !logSubBtn.disabled) logSubBtn.textContent = dict.auth.btnSubmitLogin;
        const regSubBtn = document.getElementById("registerSubmitBtn");
        if (regSubBtn && !regSubBtn.disabled) regSubBtn.textContent = dict.auth.btnSubmitRegister;
        const resSubBtn = document.getElementById("resetSubmitBtn");
        if (resSubBtn && !resSubBtn.disabled) resSubBtn.textContent = dict.auth.btnSubmitReset;
        const uLogout = document.getElementById("userLogoutBtn");
        if (uLogout) {
            const logoutSpan = uLogout.querySelector("span:last-child");
            if (logoutSpan) logoutSpan.textContent = dict.auth.btnLogout;
        }
        const uAdminBtn = document.getElementById("userAdminBtnText");
        if (uAdminBtn && dict.auth && dict.auth.adminPanelBtn) uAdminBtn.textContent = dict.auth.adminPanelBtn;
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
        dateTextCard: `${day} ${month} · ${hour}:${minute}<br><span>${tzName}</span>`,
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
    const listEl = document.getElementById("tzOptionsList");
    if (!listEl) return;

    const race = getSavedNextRace();
    const raceDateTime = race?.dateTime || "2026-09-20T16:30";
    const epochMs = getMadridEpochMs(raceDateTime);
    const raceDateObj = !isNaN(epochMs) ? new Date(epochMs) : new Date();

    listEl.innerHTML = "";

    // Sort timezones from greatest to least ("de más a menos", e.g. +10 down to -7)
    const sortedTimezones = [...TIMEZONES].sort((a, b) => {
        const offsetA = getTimezoneOffsetHours(a.id, raceDateObj);
        const offsetB = getTimezoneOffsetHours(b.id, raceDateObj);
        if (offsetB !== offsetA) {
            return offsetB - offsetA; // Descending: de más a menos
        }
        return a.city.localeCompare(b.city);
    });

    sortedTimezones.forEach(tz => {
        const isActive = tz.id === selectedTimezone;
        const tzBadge = getTimezoneBadge(tz.id, raceDateObj);

        const btn = document.createElement("button");
        btn.type = "button";
        btn.className = `tz-option${isActive ? " active" : ""}`;
        btn.setAttribute("role", "option");
        btn.setAttribute("aria-selected", isActive ? "true" : "false");
        btn.dataset.tz = tz.id;

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

    const currentTzCodeEl = document.getElementById("currentTzCode");
    const currentTzFlagEl = document.getElementById("currentTzFlag");
    const activeTz = TIMEZONES.find(t => t.id === tzId) || TIMEZONES[0];
    if (currentTzCodeEl) {
        currentTzCodeEl.textContent = activeTz.short;
    }
    if (currentTzFlagEl) {
        currentTzFlagEl.innerHTML = activeTz.flagSvg;
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

    applyTranslations(lang);
    renderNextRaceOnPage(getSavedNextRace());
    if (typeof currentOpenModalDriver !== "undefined" && currentOpenModalDriver) {
        openDriverStatsModal(currentOpenModalDriver);
    }
    if (typeof currentOpenModalTeam !== "undefined" && currentOpenModalTeam) {
        openTeamStatsModal(currentOpenModalTeam);
    }
    if (typeof activeUserAuth !== "undefined" && typeof renderUserAuthState === "function") {
        renderUserAuthState(activeUserAuth);
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
    hungary: { round: "ROUND 11", title: "HUNGARORING", location: "BUDAPEST · HUNGARY", date: "TBA" },
    belgium: { round: "ROUND 12", title: "SPA-FRANCORCHAMPS", location: "SPA · BELGIUM", date: "TBA" },
    singapore: { round: "ROUND 13", title: "SINGAPORE", location: "MARINA BAY · SINGAPORE", date: "TBA" },
    cota: { round: "ROUND 14", title: "COTA", location: "AUSTIN · USA", date: "TBA" },
    brazil: { round: "ROUND 15", title: "BRAZIL", location: "INTERLAGOS · BRAZIL", date: "TBA" }
};


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

    resultRows.innerHTML = "";

    const isEn = typeof currentLanguage !== "undefined" && currentLanguage === "en";

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
        closeRaceModal();
        closeAdminAuthModal();
        closeAdminPanel();
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
   ADMIN AUTHENTICATION & PANEL SYSTEM (RESTRICTED TO ENZO)
========================================================= */

const ADMIN_EMAIL = "enzo.castillo.lomb@gmail.com";

function isUserAdmin(user) {
    const u = user !== undefined ? user : (typeof activeUserAuth !== "undefined" && activeUserAuth ? activeUserAuth : (typeof LocalAuthStore !== "undefined" ? LocalAuthStore.getCurrentUser() : null));
    if (!u || !u.email) return false;
    return u.email.trim().toLowerCase() === ADMIN_EMAIL.toLowerCase();
}

// Default configuration datasets
const defaultNextRace = {
    round: "ROUND 10",
    title: "NÜRBURGRING GP",
    location: "NÜRBURGRING · EUROPE",
    dateText: "20 SEP · 16:30 CEST",
    dateTime: "2026-09-20T16:30"
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
    { pos: 1, number: 23, flag: "🇵🇹", driver: "Dieguiosk", team: "HRT", r: ["15", "10", "13*", "6", "25", "18", "25", "16*", "25", "--", "--", "--", "--", "--", "--"], pts: 153, dif: "--" },
    { pos: 2, number: 99, flag: "🇪🇸", driver: "Muntii", team: "Red Bull", r: ["--", "(18)", "10", "18", "18", "6", "15", "25", "15", "--", "--", "--", "--", "--", "--"], pts: 125, dif: "-28" },
    { pos: 3, number: 26, flag: "🇪🇸", driver: "Novitaa", team: "Red Bull", r: ["--", "--", "--", "9*", "15", "(26*)", "2", "(18)", "(18)", "--", "--", "--", "--", "--", "--"], pts: 88, dif: "-65" },
    { pos: 4, number: 5, flag: "🇪🇸", driver: "BigTheo", team: "Ferrari", r: ["18", "12", "8", "12", "13*", "--", "OUT", "1", "--", "--", "--", "--", "--", "--", "--"], pts: 64, dif: "-89" },
    { pos: 5, number: 92, flag: "🇪🇸", driver: "Suforr", team: "Mercedes", r: ["--", "OUT", "--", "(25)", "10", "OUT", "13*", "OUT", "5*", "--", "--", "--", "--", "--", "--"], pts: 53, dif: "-100" },
    { pos: 6, number: 7, flag: "🇮🇹", driver: "IvánR", team: "HRT", r: ["(26*)", "(26*)", "OUT", "OUT", "--", "--", "--", "--", "--", "--", "--", "--", "--", "--", "--"], pts: 52, dif: "-101" },
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
    discordUrl: "https://discord.gg/4k8kPsP6Mb",
    xUrl: "https://x.com/F0RMULAF4CTOR",
    instagramUrl: "https://www.instagram.com/formulafactorchampionship",
    season: "01",
    rounds: "15",
    drivers: "44",
    liveMode: false,
    twitchChannel: "https://www.twitch.tv/driezzz12",
    liveTitle: "ESTAMOS EN DIRECTO",
    liveSubtitle: "Sigue la retransmisión oficial de la carrera en vivo por Twitch."
};

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

// Next Race Target Elements
const nextRaceRoundEl = document.getElementById("nextRaceRound");
const nextRaceTitleEl = document.getElementById("nextRaceTitle");
const nextRaceLocationEl = document.getElementById("nextRaceLocation");
const nextRaceDateTextEl = document.getElementById("nextRaceDateText");

const nextRaceForm = document.getElementById("nextRaceForm");
const adminRaceRound = document.getElementById("adminRaceRound");
const adminRaceTitle = document.getElementById("adminRaceTitle");
const adminRaceLocation = document.getElementById("adminRaceLocation");
const adminRaceDateText = document.getElementById("adminRaceDateText");
const adminRaceDateTime = document.getElementById("adminRaceDateTime");
const raceSaveNotice = document.getElementById("raceSaveNotice");

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
const adminAddDriverBtn = document.getElementById("adminAddDriverBtn");
const adminRecalcStandingsBtn = document.getElementById("adminRecalcStandingsBtn");
const adminSaveStandingsBtn = document.getElementById("adminSaveStandingsBtn");
const standingsSaveNotice = document.getElementById("standingsSaveNotice");

// Settings Elements
const generalSettingsForm = document.getElementById("generalSettingsForm");
const adminLiveMode = document.getElementById("adminLiveMode");
const adminTwitchChannel = document.getElementById("adminTwitchChannel");
const adminLiveTitle = document.getElementById("adminLiveTitle");
const adminLiveSubtitle = document.getElementById("adminLiveSubtitle");
const adminSwitchStatusText = document.getElementById("adminSwitchStatusText");
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
const adminDriversTableBody = document.getElementById("adminDriversTableBody");
const driversSaveNotice = document.getElementById("driversSaveNotice");
const adminSaveDriversBtn = document.getElementById("adminSaveDriversBtn");

// Race Results Target & Admin Elements
const raceResultsForm = document.getElementById("raceResultsForm");
const adminSelectRace = document.getElementById("adminSelectRace");
const adminFastestDriver = document.getElementById("adminFastestDriver");
const adminFastestTime = document.getElementById("adminFastestTime");
const adminPoleDriver = document.getElementById("adminPoleDriver");
const adminPoleTime = document.getElementById("adminPoleTime");
const adminDriverDay = document.getElementById("adminDriverDay");
const adminRaceDateInput = document.getElementById("adminRaceDateInput");
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
                    ? `Please log in with the administrator account (${ADMIN_EMAIL}) to access the admin panel.`
                    : `Inicia sesión con la cuenta de administrador (${ADMIN_EMAIL}) para acceder al panel.`
            );
        } else {
            alert(
                currentLanguage === "en"
                    ? `Access restricted: Only ${ADMIN_EMAIL} has administrator privileges.`
                    : `Acceso restringido: Solo la cuenta ${ADMIN_EMAIL} tiene permisos de administración.`
            );
        }
        return;
    }

    if (!adminPanelOverlay) return;
    populateAdminForms();
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
        if (race.location && race.location.includes(" · ")) {
            const parts = race.location.split(" · ");
            nextRaceLocationEl.innerHTML = `${parts[0]} ·<br>${parts[1]}`;
        } else {
            nextRaceLocationEl.textContent = race.location || "";
        }
    }

    // Convert date and time to the selected timezone
    const raceDateTime = race.dateTime || "2026-09-20T16:30";
    const converted = formatRaceForTimezone(raceDateTime, selectedTimezone, currentLanguage);

    if (converted) {
        if (nextRaceDateTextEl) {
            nextRaceDateTextEl.innerHTML = converted.dateTextCard;
        }
        raceDate = converted.epochMs;
        updateCountdown();

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
            nextRaceDateTextEl.innerHTML = `${race.dateText.replace(" CEST", "")}<br><span>CEST</span>`;
        } else {
            nextRaceDateTextEl.textContent = race.dateText || "";
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
    return defaultStandings;
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
                if (idx >= 10) {
                    if (!isStandingsExpanded) {
                        rowDiv.classList.add("standings-row-hidden");
                    } else {
                        rowDiv.classList.add("standings-row-revealed");
                        const delayStep = Math.min(idx - 10, 25);
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
                driverLeaderRow.innerHTML = `
                    <div class="ranking-leader-left">
                        <span class="ranking-leader-pos">1.</span>
                        <div class="ranking-leader-info">
                            <span class="ranking-leader-name driver-clickable" data-driver="${escapeHtml(d1.driver)}">${escapeHtml(d1.driver)}</span>
                            <div class="ranking-leader-meta">
                                <span class="ranking-team-pill ${getTeamClass(d1.team)} team-clickable" data-team="${escapeHtml(d1.team)}" title="Ver equipo ${escapeHtml(d1.team)}"><span class="team-dot"></span>${escapeHtml(d1.team)}</span>
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
                p2Html = `
                    <div class="ranking-podium-col ranking-p2 driver-card-clickable" id="driverP2Col" data-driver="${escapeHtml(d2.driver)}" title="Ver estadísticas de ${escapeHtml(d2.driver)}">
                        <div class="ranking-podium-left">
                            <span class="ranking-podium-pos">2.</span>
                            <div class="ranking-podium-info">
                                <span class="ranking-podium-name driver-clickable" data-driver="${escapeHtml(d2.driver)}">${escapeHtml(d2.driver)}</span>
                                <div class="ranking-podium-meta">
                                    <span class="ranking-team-pill ${getTeamClass(d2.team)} team-clickable" data-team="${escapeHtml(d2.team)}" title="Ver equipo ${escapeHtml(d2.team)}"><span class="team-dot"></span>${escapeHtml(d2.team)}</span>
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
                p3Html = `
                    <div class="ranking-podium-col ranking-p3 driver-card-clickable" id="driverP3Col" data-driver="${escapeHtml(d3.driver)}" title="Ver estadísticas de ${escapeHtml(d3.driver)}">
                        <div class="ranking-podium-left">
                            <span class="ranking-podium-pos">3.</span>
                            <div class="ranking-podium-info">
                                <span class="ranking-podium-name driver-clickable" data-driver="${escapeHtml(d3.driver)}">${escapeHtml(d3.driver)}</span>
                                <div class="ranking-podium-meta">
                                    <span class="ranking-team-pill ${getTeamClass(d3.team)} team-clickable" data-team="${escapeHtml(d3.team)}" title="Ver equipo ${escapeHtml(d3.team)}"><span class="team-dot"></span>${escapeHtml(d3.team)}</span>
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
                if (idx >= 10) {
                    if (!isStandingsExpanded) {
                        rowDiv.classList.add("standings-row-hidden");
                    } else {
                        rowDiv.classList.add("standings-row-revealed");
                        const delayStep = Math.min(idx - 10, 25);
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
    }

    // Fallback if legacy standingsTableBody is present
    if (standingsTableBody) {
        standingsTableBody.innerHTML = "";
        sorted.forEach((d, idx) => {
            const tr = document.createElement("tr");
            if (idx === 0) tr.classList.add("leader");
            if (idx >= 10) {
                if (!isStandingsExpanded) {
                    tr.classList.add("standings-row-hidden");
                } else {
                    tr.classList.add("standings-row-revealed");
                    const delayStep = Math.min(idx - 10, 25);
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

        return {
            pos,
            number: meta.number || pos,
            flag: meta.flag || "🏁",
            driver: driverName,
            team,
            r: rounds,
            pts,
            dif
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
                <span class="driver-flag-emoji">${row.flag || ""}</span>
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

    return {
        driver: match.driver,
        team: match.team,
        pos: match.pos,
        pts: match.pts,
        number: match.number,
        flag: match.flag,
        dif: match.dif,
        rounds: match.r,
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

    // Modal strip
    const strip = document.getElementById("driverModalStrip");
    if (strip) {
        strip.className = `driver-modal-strip ${teamCls}`;
    }

    // Dorsal
    const dorsalEl = document.getElementById("driverModalDorsal");
    if (dorsalEl) {
        dorsalEl.textContent = data.number ? `#${data.number}` : `#${data.pos}`;
    }

    // Flag & Name
    const flagEl = document.getElementById("driverModalFlag");
    if (flagEl) flagEl.textContent = data.flag || "🏁";

    const nameEl = document.getElementById("driverModalName");
    if (nameEl) nameEl.textContent = data.driver;

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
                    <span class="round-card-mini-flag">${gp.flag}</span>
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
                        <span class="team-squad-flag">${d.flag || '🏁'}</span>
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
                    <span class="round-card-mini-flag">${gp.flag}</span>
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

// Initialize modals on script load / DOM ready
if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", () => {
        initStandingsViewTabs();
        initDriverStatsModal();
        initTeamStatsModal();
    });
} else {
    initStandingsViewTabs();
    initDriverStatsModal();
    initTeamStatsModal();
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
                rowDiv.innerHTML = `
                    <span class="ranking-row-pos">${idx + 1}</span>
                    <span class="ranking-team-cell"><span class="ranking-team-pill ${getTeamClass(row.team)}"><span class="team-dot"></span>${escapeHtml(row.team)}</span></span>
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
                rowDiv.innerHTML = `
                    <span class="ranking-row-pos">${idx + 1}</span>
                    <span class="ranking-team-cell"><span class="ranking-team-pill ${getTeamClass(row.team)}"><span class="team-dot"></span>${escapeHtml(row.team)}</span></span>
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

    if (totalCount <= 10) {
        btn.parentElement.style.display = "none";
        return;
    }
    btn.parentElement.style.display = "flex";

    const isEn = typeof currentLanguage !== "undefined" && currentLanguage === "en";

    if (isStandingsExpanded) {
        label.textContent = isEn ? "SHOW LESS (TOP 10)" : "MOSTRAR MENOS (TOP 10)";
        btn.classList.add("is-expanded");
        btn.setAttribute("aria-expanded", "true");
    } else {
        label.textContent = isEn
            ? `VIEW FULL STANDINGS (P11 - P${totalCount})`
            : `VER CLASIFICACIÓN COMPLETA (P11 - P${totalCount})`;
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

    // Live Mode (Transmisión en directo Twitch)
    const heroSection = document.getElementById("home");
    const heroContentStandard = document.getElementById("heroContentStandard");
    const heroContentLive = document.getElementById("heroContentLive");
    const twitchPlayerContainer = document.getElementById("twitchPlayerContainer");
    const twitchExternalLink = document.getElementById("twitchExternalLink");
    const heroLiveHeading = document.getElementById("heroLiveHeading");
    const heroLiveSubtitle = document.getElementById("heroLiveSubtitle");

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

            // Mount or update Twitch embed iframe
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
}

function escapeHtml(str) {
    if (!str) return "";
    return String(str)
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#039;");
}

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
    Object.keys(raceResults).forEach(raceKey => {
        updateCalendarCardForRace(raceKey, raceResults[raceKey]);
    });
}

function updateCalendarCardForRace(raceKey, raceData) {
    let card = document.querySelector(`.calendar-card[data-race="${raceKey}"]`);
    if (!card) {
        const meta = seasonRacesMeta[raceKey];
        if (meta) {
            const roundNumber = meta.round.replace("ROUND ", "").trim();
            const cards = document.querySelectorAll(".calendar-card");
            cards.forEach(c => {
                const numEl = c.querySelector(".calendar-number");
                if (numEl && numEl.textContent.trim() === roundNumber) {
                    card = c;
                }
            });
        }
    }

    if (!card) return;

    card.setAttribute("data-race", raceKey);
    const isCompleted = raceData && (
        raceData.status === "COMPLETED" || 
        (raceData.drivers && raceData.drivers.length > 0 && raceData.winner && raceData.winner !== "TBA")
    );

    const statusEl = card.querySelector(".calendar-status");
    const dateEl = card.querySelector(".calendar-date");
    if (raceData && raceData.date && dateEl) {
        dateEl.textContent = raceData.date;
    }

    if (isCompleted) {
        card.classList.remove("upcoming", "next");
        card.classList.add("completed", "race-link");
        if (statusEl) statusEl.textContent = "COMPLETED";

        let hint = card.querySelector(".click-hint");
        if (!hint) {
            hint = document.createElement("span");
            hint.className = "click-hint";
            const curLang = typeof currentLanguage !== "undefined" ? currentLanguage : "es";
            hint.textContent = (translations[curLang]?.calendar?.viewResults) || "RESULTS →";
            const footer = card.querySelector(".calendar-card-footer") || card;
            footer.appendChild(hint);
        }

        card.onclick = () => openRace(raceKey);
    } else {
        card.classList.remove("completed", "race-link");
        let hint = card.querySelector(".click-hint");
        if (hint) hint.remove();
        card.onclick = null;

        const roundNumber = card.querySelector(".calendar-number")?.textContent?.trim();
        if (roundNumber === "10") {
            card.classList.add("next");
            if (statusEl) statusEl.textContent = "NEXT RACE";
        } else if (roundNumber === "15") {
            card.classList.add("upcoming");
            if (statusEl) statusEl.textContent = "FINAL ROUND";
        } else {
            card.classList.add("upcoming");
            if (statusEl) statusEl.textContent = "UPCOMING";
        }
    }
}

// --- Official Driver Roster Management ---
function getOfficialDriverRoster() {
    if (currentPilotos && currentPilotos.length > 0) {
        return currentPilotos.map(p => ({
            id: p.id,
            driver: p.driver,
            team: p.team
        }));
    }
    return defaultDriverRoster;
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
    if (adminPilotTotalCount) adminPilotTotalCount.textContent = roster.length;

    const lowerFilter = (filterText || "").trim().toLowerCase();
    const filtered = lowerFilter
        ? roster.filter(r => r.driver.toLowerCase().includes(lowerFilter) || r.team.toLowerCase().includes(lowerFilter))
        : roster;

    filtered.forEach((item, index) => {
        const actualIndex = roster.indexOf(item);
        const pilotId = item.id || getPilotDocId(item.driver);
        const tr = document.createElement("tr");
        tr.dataset.index = actualIndex;
        tr.dataset.pilotId = pilotId;

        const effectiveTeam = pendingTeamChanges.has(pilotId)
            ? pendingTeamChanges.get(pilotId).team
            : item.team;

        let teamOptions = "";
        F1_TEAMS.forEach(team => {
            const isSelected = effectiveTeam && effectiveTeam.toLowerCase() === team.toLowerCase();
            teamOptions += `<option value="${escapeHtml(team)}" ${isSelected ? "selected" : ""}>${escapeHtml(team)}</option>`;
        });

        tr.innerHTML = `
            <td style="font-weight: bold; color: var(--gold); text-align: center;">${actualIndex + 1}</td>
            <td style="font-weight: 600; color: #fff;">${escapeHtml(item.driver)}</td>
            <td>
                <select class="admin-pilot-team-select" data-pilot-id="${pilotId}" data-driver="${escapeHtml(item.driver)}">
                    ${teamOptions}
                </select>
            </td>
            <td style="text-align: center;">
                <button type="button" class="admin-remove-btn admin-pilot-remove-btn" data-pilot-id="${pilotId}" data-driver="${escapeHtml(item.driver)}" title="Eliminar piloto de Firestore">🗑</button>
            </td>
        `;

        const select = tr.querySelector(".admin-pilot-team-select");
        if (select) {
            select.addEventListener("change", () => {
                pendingTeamChanges.set(pilotId, { pilotId, driver: item.driver, team: select.value });
            });
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
        winner: "TBA",
        pole: "TBA",
        fastest: "TBA",
        driverDay: "TBA",
        drivers: []
    };

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

    // Race Date
    if (adminRaceDateInput) adminRaceDateInput.value = (race.date && race.date !== "TBA") ? race.date : (seasonRacesMeta[raceKey]?.date || "");

    // Position rows: if race has drivers, render them; otherwise render empty table state
    const driversToRender = Array.isArray(race.drivers) && race.drivers.length > 0 ? race.drivers : [];
    renderRacePositionsTable(driversToRender);
}

// Populate Admin Forms from current stored states
function populateAdminForms() {
    const race = getSavedNextRace();
    if (adminRaceRound) adminRaceRound.value = race.round || "";
    if (adminRaceTitle) adminRaceTitle.value = race.title || "";
    if (adminRaceLocation) adminRaceLocation.value = race.location || "";
    if (adminRaceDateText) adminRaceDateText.value = race.dateText || "";
    if (adminRaceDateTime) adminRaceDateTime.value = race.dateTime || "";

    const standings = getSavedStandings();
    renderAdminStandingsEditor(standings);

    const settings = getSavedSettings();
    if (adminLiveMode) {
        adminLiveMode.checked = Boolean(settings.liveMode);
    }
    if (adminSwitchStatusText) {
        const isLive = Boolean(settings.liveMode);
        adminSwitchStatusText.textContent = isLive ? "MODO DIRECTO ACTIVADO" : "MODO DIRECTO DESACTIVADO";
        adminSwitchStatusText.classList.toggle("is-active", isLive);
    }
    if (adminTwitchChannel) adminTwitchChannel.value = settings.twitchChannel || "https://www.twitch.tv/driezzz12";
    if (adminLiveTitle) adminLiveTitle.value = settings.liveTitle || "ESTAMOS EN DIRECTO";
    if (adminLiveSubtitle) adminLiveSubtitle.value = settings.liveSubtitle || "Sigue la retransmisión oficial de la carrera en vivo por Twitch.";
    if (adminDiscordUrl) adminDiscordUrl.value = settings.discordUrl || "";
    if (adminXUrl) adminXUrl.value = settings.xUrl || "";
    if (adminInstagramUrl) adminInstagramUrl.value = settings.instagramUrl || "";
    if (adminStatSeason) adminStatSeason.value = settings.season || "";
    if (adminStatRounds) adminStatRounds.value = settings.rounds || "";
    if (adminStatDrivers) adminStatDrivers.value = settings.drivers || "";

    renderAdminDriversTab();

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
            driverMap.set(norm, {
                id: docSnap.id,
                driver: data.driver || docSnap.id,
                team: data.team || "Independent",
                pos: data.pos || getOfficialDriverRank(data.driver || docSnap.id),
                pts: Number(data.pts) || 0
            });
        });

        const list = Array.from(driverMap.values());

        // If Firestore contains outdated or misspelled data from earlier sessions, migrate to official 44-driver dataset
        if (hasCorruptedPilot || !dieguioskFound || !rikidorsaFound || list.length < 44) {
            console.log("Migrating Firestore pilots to official FFC 2010 Season dataset...");
            try {
                const batch = writeBatch(db);
                batch.delete(doc(db, "pilotos", "dlegulosk"));
                batch.delete(doc(db, "pilotos", "rikiorsa"));

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
                return;
            } catch (err) {
                console.error("Error auto-migrating pilots into Firestore:", err);
            }
        }

        currentPilotos = sortDriversStandings(list);

        renderStandingsOnPage(currentPilotos);
        if (typeof updateStandingsToggleUI === "function") {
            updateStandingsToggleUI(currentPilotos.length);
        }

        if (adminPanelOverlay && adminPanelOverlay.classList.contains("active")) {
            renderAdminStandingsEditor(currentPilotos);
            renderAdminDriversTab(adminSearchPilotInput ? adminSearchPilotInput.value : "");
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
                if (adminRaceRound) adminRaceRound.value = currentNextRace.round || "";
                if (adminRaceTitle) adminRaceTitle.value = currentNextRace.title || "";
                if (adminRaceLocation) adminRaceLocation.value = currentNextRace.location || "";
                if (adminRaceDateText) adminRaceDateText.value = currentNextRace.dateText || "";
                if (adminRaceDateTime) adminRaceDateTime.value = currentNextRace.dateTime || "";
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
                if (adminLiveSubtitle) adminLiveSubtitle.value = currentSettings.liveSubtitle || "Sigue la retransmisión oficial de la carrera en vivo por Twitch.";
                if (adminDiscordUrl) adminDiscordUrl.value = currentSettings.discordUrl || "";
                if (adminXUrl) adminXUrl.value = currentSettings.xUrl || "";
                if (adminInstagramUrl) adminInstagramUrl.value = currentSettings.instagramUrl || "";
                if (adminStatSeason) adminStatSeason.value = currentSettings.season || "";
                if (adminStatRounds) adminStatRounds.value = currentSettings.rounds || "";
                if (adminStatDrivers) adminStatDrivers.value = currentSettings.drivers || "";
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
            updateCalendarCardForRace(docSnap.id, rData);

            if (rData.winner === "Dlegulosk" || (rData.drivers && rData.drivers.some(d => d.driver === "Dlegulosk" || d.driver === "RikiORSA" || d.driver === "Ted Theo"))) {
                hasLegacyRaceData = true;
            }
        });

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

        // Keep season matrix spreadsheet and driver modal synchronized with latest race results
        renderFfcMatrixTable();
        if (currentOpenModalDriver) {
            const overlay = document.getElementById("driverModalOverlay");
            if (overlay && overlay.classList.contains("active")) {
                openDriverStatsModal(currentOpenModalDriver);
            }
        }
    }, (error) => {
        console.error("Error subscribing to 'carreras' collection:", error);
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
    });
});

// Save Next Race
if (nextRaceForm) {
    nextRaceForm.addEventListener("submit", async (e) => {
        e.preventDefault();
        const updated = {
            round: adminRaceRound.value.trim(),
            title: adminRaceTitle.value.trim(),
            location: adminRaceLocation.value.trim(),
            dateText: adminRaceDateText.value.trim(),
            dateTime: adminRaceDateTime.value
        };

        try {
            if (raceSaveNotice) {
                raceSaveNotice.textContent = "Guardando en Firestore...";
                raceSaveNotice.style.color = "var(--gold)";
            }
            await setDoc(doc(db, "configuracion", "proxima_carrera"), updated);
            currentNextRace = updated;
            renderNextRaceOnPage(updated);

            if (raceSaveNotice) {
                raceSaveNotice.textContent = "✓ Próxima carrera guardada en Firestore";
                raceSaveNotice.style.color = "#3fb950";
                setTimeout(() => { raceSaveNotice.textContent = ""; }, 3000);
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
                    list.push({ id: pilotId, driver: name, team: officialTeam, pts });
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
                batch.set(docRef, {
                    driver: p.driver,
                    team: p.team,
                    pts: Number(p.pts) || 0
                }, { merge: true });
            });
            await batch.commit();

            currentPilotos = list;
            renderStandingsOnPage(list);
            renderAdminStandingsEditor(list);

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

// Save General Settings
if (generalSettingsForm) {
    generalSettingsForm.addEventListener("submit", async (e) => {
        e.preventDefault();
        const settings = {
            liveMode: adminLiveMode ? adminLiveMode.checked : false,
            twitchChannel: adminTwitchChannel ? adminTwitchChannel.value.trim() : "https://www.twitch.tv/driezzz12",
            liveTitle: adminLiveTitle ? adminLiveTitle.value.trim() : "ESTAMOS EN DIRECTO",
            liveSubtitle: adminLiveSubtitle ? adminLiveSubtitle.value.trim() : "Sigue la retransmisión oficial de la carrera en vivo por Twitch.",
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
        const selects = document.querySelectorAll(".admin-pilot-team-select");
        selects.forEach(sel => {
            const pilotId = sel.dataset.pilotId || getPilotDocId(sel.dataset.driver);
            const driverName = sel.dataset.driver;
            const newTeam = sel.value;
            if (pilotId && driverName) {
                pendingTeamChanges.set(pilotId, { pilotId, driver: driverName, team: newTeam });
            }
        });

        if (pendingTeamChanges.size === 0) {
            if (driversSaveNotice) {
                driversSaveNotice.textContent = "No hay cambios de equipo pendientes.";
                driversSaveNotice.style.color = "var(--gold)";
                setTimeout(() => { driversSaveNotice.textContent = ""; }, 2500);
            }
            return;
        }

        if (driversSaveNotice) {
            driversSaveNotice.textContent = "Actualizando equipos en Firestore...";
            driversSaveNotice.style.color = "var(--gold)";
        }
        try {
            const batch = writeBatch(db);
            pendingTeamChanges.forEach(({ pilotId, driver, team }) => {
                batch.set(doc(db, "pilotos", pilotId), {
                    driver: driver,
                    team: team
                }, { merge: true });
            });
            await batch.commit();
            pendingTeamChanges.clear();

            if (driversSaveNotice) {
                driversSaveNotice.textContent = "✓ Equipos actualizados en Firestore en tiempo real";
                driversSaveNotice.style.color = "#3fb950";
                setTimeout(() => { driversSaveNotice.textContent = ""; }, 3000);
            }
        } catch (err) {
            console.error("Error saving driver teams to Firestore:", err);
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
        const name = nameInput ? nameInput.value.trim() : "";
        const team = teamSelect ? teamSelect.value : "HRT";

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
                pts: 0
            });

            nameInput.value = "";
            if (driversSaveNotice) {
                driversSaveNotice.textContent = `✓ Piloto ${name} guardado en Firestore en tiempo real`;
                driversSaveNotice.style.color = "#3fb950";
                setTimeout(() => { driversSaveNotice.textContent = ""; }, 3000);
            }
        } catch (err) {
            console.error("Error adding pilot to Firestore:", err);
            if (driversSaveNotice) {
                driversSaveNotice.textContent = "Error al añadir a Firestore: " + err.message;
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
                    if (posNum > 10) {
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
                        ? `VIEW FULL STANDINGS (P11 - P${saved.length})`
                        : `VER CLASIFICACIÓN COMPLETA (P11 - P${saved.length})`;
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
            driversMap.set(k, {
                id: getPilotDocId(d.driver),
                driver: d.driver,
                team: getDriverTeam(d.driver) || d.team || "Independent",
                pts: 0
            });
            finishesMap.set(k, {});
        }
    });

    if (Array.isArray(baseDriverList)) {
        baseDriverList.forEach(d => {
            if (!d.driver) return;
            const k = normalizeDriverKey(d.driver);
            if (!driversMap.has(k)) {
                driversMap.set(k, {
                    id: d.id || getPilotDocId(d.driver),
                    driver: d.driver,
                    team: getDriverTeam(d.driver) || d.team || "Independent",
                    pts: 0
                });
                finishesMap.set(k, {});
            }
        });
    }

    // 2. Iterate through all completed races and calculate official points
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

    // 3. Sort drivers: points descending, then tiebreakers (most 1st places, 2nd places...), then alphabetically
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
            batch.set(docRef, {
                driver: p.driver,
                team: p.team || getDriverTeam(p.driver) || "Independent",
                pts: Number(p.pts) || 0
            }, { merge: true });
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

        const updatedRace = {
            round: meta.round,
            title: meta.title,
            location: meta.location,
            date: raceDate || meta.date,
            status: "COMPLETED",
            winner: winnerDriver || drivers[0].driver,
            pole: poleDriver && poleTime ? `${poleDriver} · ${poleTime}` : (poleDriver || "TBA"),
            fastest: `${fastestDriver} · ${fastestTime}`,
            driverDay: driverDay || winnerDriver || drivers[0].driver,
            drivers: drivers
        };

        try {
            if (raceResultsSaveNotice) {
                raceResultsSaveNotice.textContent = "Guardando resultados y recalculando clasificación...";
                raceResultsSaveNotice.style.color = "var(--gold)";
            }
            await setDoc(doc(db, "carreras", raceKey), updatedRace);

            raceResults[raceKey] = updatedRace;
            updateCalendarCardForRace(raceKey, updatedRace);

            // Automatically recalculate points & standings for drivers and teams
            await recalculateAndSyncStandings(raceResults);

            if (raceResultsSaveNotice) {
                raceResultsSaveNotice.textContent = `✓ Resultados de ${meta.title} guardados. Puntos y standings (pilotos y equipos) actualizados.`;
                raceResultsSaveNotice.style.color = "#3fb950";
                setTimeout(() => { raceResultsSaveNotice.textContent = ""; }, 4000);
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
    updateCalendarCardForRace(raceKey, resetRaceData);
    populateRaceResultsEditor(raceKey);

    if (raceResultsSaveNotice) {
        raceResultsSaveNotice.textContent = `Restableciendo resultados de ${meta.title} y actualizando clasificación...`;
        raceResultsSaveNotice.style.color = "var(--gold)";
    }

    try {
        // 2. Persist reset race in Firestore
        await setDoc(doc(db, "carreras", raceKey), resetRaceData);

        // 3. Recalculate standings and sync to Firestore
        await recalculateAndSyncStandings(raceResults);

        if (raceResultsSaveNotice) {
            raceResultsSaveNotice.textContent = `✓ Resultados de ${meta.title} restablecidos con éxito. Standings actualizados.`;
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

let activeUserAuth = null;
let currentAuthTab = "login";

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

        const userEmailLower = (user.email || "").toLowerCase().trim();
        const isIsraelUser = userEmailLower === "formularinuno8@gmail.com";

        if (userProfileStatusVal) {
            if (isIsraelUser) {
                userProfileStatusVal.textContent = "ISRAEL";
                userProfileStatusVal.className = "user-profile-badge user-badge-israel";
            } else if (isAdmin) {
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
    }
}

// Initialize from local user store if present
const initialSavedLocalUser = LocalAuthStore.getCurrentUser();
if (initialSavedLocalUser) {
    renderUserAuthState(initialSavedLocalUser);
}

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
    } else {
        const local = LocalAuthStore.getCurrentUser();
        renderUserAuthState(local);
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
        if (loginSubmitBtn) {
            loginSubmitBtn.disabled = true;
            loginSubmitBtn.textContent = isEn ? "LOGGING IN..." : "INICIANDO SESIÓN...";
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
                loginSubmitBtn.textContent = dict.auth ? dict.auth.btnSubmitLogin : "INICIAR SESIÓN";
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

        if (registerSubmitBtn) {
            registerSubmitBtn.disabled = true;
            registerSubmitBtn.textContent = isEn ? "CREATING ACCOUNT..." : "CREANDO CUENTA...";
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
                registerSubmitBtn.textContent = dict.auth ? dict.auth.btnSubmitRegister : "CREAR CUENTA";
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

        if (resetSubmitBtn) {
            resetSubmitBtn.disabled = true;
            resetSubmitBtn.textContent = isEn ? "SENDING..." : "ENVIANDO...";
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
                resetSubmitBtn.textContent = dict.auth ? dict.auth.btnSubmitReset : "ENVIAR ENLACE";
            }
        }
    });
}




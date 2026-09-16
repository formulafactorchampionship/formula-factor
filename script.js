/* =========================================================
   FFC — COUNTDOWN
========================================================= */

function getSavedRaceTimestamp() {
    try {
        const saved = localStorage.getItem("ffc_next_race");
        if (saved) {
            const data = JSON.parse(saved);
            if (data.dateTime) {
                const parsed = new Date(data.dateTime).getTime();
                if (!isNaN(parsed)) return parsed;
            }
        }
    } catch (e) {
        console.error("Error loading saved race date:", e);
    }
    return new Date("2026-09-20T16:30:00+02:00").getTime();
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
            viewResults: "VER RESULTADOS →",
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
            viewResults: "VIEW RESULTS →",
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

    // Calendar cards status & country
    updateCalendarCards(lang);

    // Standings expand button text
    if (typeof getSavedStandings === "function") {
        const drivers = getSavedStandings();
        updateStandingsToggleUI(drivers.length);
    }
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

    const btnEs = document.getElementById("langBtnEs");
    const btnEn = document.getElementById("langBtnEn");
    if (btnEs && btnEn) {
        const isEs = lang === "es";
        btnEs.classList.toggle("active", isEs);
        btnEs.setAttribute("aria-pressed", isEs ? "true" : "false");
        btnEn.classList.toggle("active", !isEs);
        btnEn.setAttribute("aria-pressed", !isEs ? "true" : "false");
    }

    applyTranslations(lang);
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

        winner: "IvanR",
        pole: "IvanR · 1:20.843",
        fastest: "IvanR · 1:22.300",
        driverDay: "BigTheo",

        drivers: [

            { pos: 1, driver: "IvanR", team: "HRT", status: "FINISHED" },
            { pos: 2, driver: "BigTheo", team: "Ferrari", status: "FINISHED" },
            { pos: 3, driver: "Dieguiosk", team: "HRT", status: "FINISHED" },
            { pos: 4, driver: "TheWereGH", team: "Sauber", status: "FINISHED" },
            { pos: 5, driver: "Sir Galactic", team: "Renault", status: "FINISHED" },
            { pos: 6, driver: "AMF", team: "Williams", status: "FINISHED" },
            { pos: 7, driver: "Daidaiiro", team: "Lotus", status: "FINISHED" },
            { pos: 8, driver: "Dericcc", team: "Virgin", status: "FINISHED" },
            { pos: 9, driver: "J-DOT", team: "McLaren", status: "FINISHED" },
            { pos: 10, driver: "Baena", team: "Mercedes", status: "DNF" },
            { pos: 11, driver: "TucnakCZE", team: "Force India", status: "DNF" },
            { pos: 12, driver: "CarlosUre", team: "Force India", status: "DNF" },
            { pos: 13, driver: "Sbinn", team: "Toro Rosso", status: "DNF" },
            { pos: 14, driver: "Y6NJ", team: "Red Bull", status: "DNS" }

        ]

    },


    malaysia: {

        round: "ROUND 02",
        title: "MALAYSIA",
        location: "SEPANG · MALAYSIA",
        date: "28 JUN",

        winner: "IvanR",
        pole: "IvanR · 1:33.062",
        fastest: "IvanR · 1:33.662",
        driverDay: "IvanR",

        drivers: [

            { pos: 1, driver: "IvanR", team: "HRT", status: "FINISHED" },
            { pos: 2, driver: "Muntii", team: "Red Bull", status: "FINISHED" },
            { pos: 3, driver: "Baena", team: "Mercedes", status: "FINISHED" },
            { pos: 4, driver: "BigTheo", team: "Ferrari", status: "FINISHED" },
            { pos: 5, driver: "Dieguiosk", team: "HRT", status: "FINISHED" },
            { pos: 6, driver: "Viktolo", team: "Toro Rosso", status: "FINISHED" },
            { pos: 7, driver: "TheWereGH", team: "Sauber", status: "FINISHED" },
            { pos: 8, driver: "AMF", team: "Williams", status: "FINISHED" },
            { pos: 9, driver: "Daidaiiro", team: "Lotus", status: "FINISHED" },
            { pos: 10, driver: "Novi", team: "McLaren", status: "FINISHED" },
            { pos: 11, driver: "Oscar Soria", team: "Williams", status: "DNF" },
            { pos: 12, driver: "Nando_FA14", team: "Renault", status: "DNF" },
            { pos: 13, driver: "Drips", team: "McLaren", status: "DNF" },
            { pos: 14, driver: "Suforr", team: "Mercedes", status: "DNF" }

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
            { pos: 12, driver: "Nando_FA14", team: "Renault", status: "FINISHED" },
            { pos: 13, driver: "Oscar Soria", team: "Williams", status: "FINISHED" },
            { pos: 14, driver: "Dericcc", team: "Virgin", status: "FINISHED" },
            { pos: 15, driver: "TheAgus60", team: "McLaren", status: "DNF" },
            { pos: 16, driver: "Novi", team: "McLaren", status: "DNF" },
            { pos: 17, driver: "Baena", team: "Mercedes", status: "DNF" },
            { pos: 18, driver: "IvanR", team: "HRT", status: "DNF" }

        ]

    },


    turkey: {

        round: "ROUND 04",
        title: "TURKEY",
        location: "ISTANBUL PARK · TURKEY",
        date: "19 JUL",

        winner: "Suforr",
        pole: "IvanR · 1:25.843",
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
            { pos: 10, driver: "TheWereGH", team: "Sauber", status: "DNF" },
            { pos: 11, driver: "IvanR", team: "HRT", status: "DNF" },

            /*
             * The original result supplied contains TheWereGH again
             * with McLaren. The user confirmed both spellings refer
             * to the same pilot. It is therefore retained as a
             * separate source row rather than inventing another driver.
             */
            { pos: 12, driver: "TheWereGH", team: "McLaren", status: "DNF" }

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
            { pos: 6, driver: "Viktolo", team: "Toro Rosso", status: "FINISHED" },
            { pos: 7, driver: "AMF", team: "Williams", status: "FINISHED" },
            { pos: 8, driver: "Licha", team: "Ferrari", status: "FINISHED" },
            { pos: 9, driver: "Rafale", team: "McLaren", status: "FINISHED" },
            { pos: 10, driver: "Dericcc", team: "Virgin", status: "DNF" },
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
            { pos: 3, driver: "Erik Brenna", team: "Toro Rosso", status: "FINISHED" },
            { pos: 4, driver: "Kri", team: "Renault", status: "FINISHED" },

            /* Novi changed to Ferrari from Monza */
            { pos: 5, driver: "Novi", team: "Ferrari", status: "FINISHED" },

            /* Nando_FA14 changed to HRT from Monza */
            { pos: 6, driver: "Nando_FA14", team: "HRT", status: "FINISHED" },

            { pos: 7, driver: "Muntii", team: "Red Bull", status: "FINISHED" },
            { pos: 8, driver: "Rafale", team: "McLaren", status: "FINISHED" },
            { pos: 9, driver: "TheWereGH", team: "Sauber", status: "FINISHED" },
            { pos: 10, driver: "Licha", team: "Ferrari", status: "FINISHED" },
            { pos: 11, driver: "Suforr", team: "Mercedes", status: "FINISHED" },
            { pos: 12, driver: "Sbinn", team: "Toro Rosso", status: "FINISHED" },
            { pos: 13, driver: "Dericcc", team: "Virgin", status: "FINISHED" },
            { pos: 14, driver: "Zenthix", team: "Williams", status: "FINISHED" },
            { pos: 15, driver: "TheAgus60", team: "McLaren", status: "FINISHED" }

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
            { pos: 6, driver: "Krisdemur", team: "Williams", status: "FINISHED" },
            { pos: 7, driver: "Farlonso", team: "Lotus", status: "FINISHED" },
            { pos: 8, driver: "TheAgus60", team: "McLaren", status: "FINISHED" },
            { pos: 9, driver: "Novitaa", team: "Red Bull", status: "DNF" },
            { pos: 10, driver: "TheWereGH", team: "Sauber", status: "DNF" },
            { pos: 11, driver: "BigTheo", team: "Ferrari", status: "DNF" },
            { pos: 12, driver: "Dericcc", team: "Virgin", status: "DNF" },
            { pos: 13, driver: "Nando_FA14", team: "HRT", status: "DNF" },
            { pos: 14, driver: "Sbinn", team: "Toro Rosso", status: "DNF" },
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
        pole: "Suforr · 1:28.943",
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
            { pos: 9, driver: "Ted Theo", team: "Ferrari", status: "DNF" },
            { pos: 10, driver: "Gold", team: "Williams", status: "DNF" },

            /* Novi changed to Toro Rosso at Silverstone */
            { pos: 11, driver: "Novi", team: "Toro Rosso", status: "DNF" },

            { pos: 12, driver: "RikiORSA", team: "Virgin", status: "DNF" },
            { pos: 13, driver: "rossi", team: "McLaren", status: "DNF" },
            { pos: 14, driver: "Suforr", team: "Mercedes", status: "DNF" }

        ]

    },


    hockenheim: {

        round: "ROUND 09",
        title: "HOCKENHEIM",
        location: "HOCKENHEIMRING · GERMANY",
        date: "13 SEP",

        winner: "Dieguiosk",
        pole: "Dieguiosk · 1:14.751",
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
            { pos: 8, driver: "Suforr", team: "Mercedes", status: "DNF" },
            { pos: 9, driver: "Licha", team: "Ferrari", status: "DNF" },
            { pos: 10, driver: "TheAgus60", team: "McLaren", status: "DNF" },
            { pos: 11, driver: "Dericcc", team: "Virgin", status: "DNF" },
            { pos: 12, driver: "Kri", team: "Renault", status: "DNS" }

        ]

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


function openRace(raceKey) {

    const race = raceResults[raceKey];

    if (!race || !raceOverlay) return;

    resultRound.textContent = race.round;
    resultTitle.textContent = race.title;
    resultLocation.textContent = race.location;
    resultDate.textContent = race.date;

    resultWinner.textContent = race.winner;
    resultPole.textContent = race.pole;
    resultFastest.textContent = race.fastest;
    resultDriverDay.textContent = race.driverDay;

    resultRows.innerHTML = "";

    race.drivers.forEach((driver) => {

        const row = document.createElement("tr");

        const statusClass =
            driver.status === "DNF" ? "status-dnf" :
            driver.status === "DNS" ? "status-dns" :
            driver.status === "DSQ" ? "status-dsq" :
            "";

        const displayStatus = (typeof currentLanguage !== "undefined" && currentLanguage === "es" && driver.status === "FINISHED")
            ? "FINALIZADO"
            : driver.status;

        row.innerHTML = `
            <td class="result-position">${driver.pos}</td>
            <td>${driver.driver}</td>
            <td class="${getTeamClass(driver.team)}">${driver.team}</td>
            <td class="${statusClass}">${displayStatus}</td>
        `;

        resultRows.appendChild(row);

    });

    raceOverlay.classList.add("active");
    document.body.classList.add("modal-open");

}


function closeRaceModal() {

    if (!raceOverlay) return;

    raceOverlay.classList.remove("active");
    document.body.classList.remove("modal-open");

}


/* Calendar cards */

document.querySelectorAll(".race-link").forEach((card) => {

    card.addEventListener("click", () => {

        const raceKey = card.dataset.race;

        openRace(raceKey);

    });

});


if (closeRace) {
    closeRace.addEventListener("click", closeRaceModal);
}

if (backToCalendar) {
    backToCalendar.addEventListener("click", closeRaceModal);
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
   ADMIN AUTHENTICATION & PANEL SYSTEM
========================================================= */

const ADMIN_PASSWORD = "adminpassword2010";

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
    { pos: 25, driver: "Dadaaliro", team: "Lotus", pts: 9 },
    { pos: 26, driver: "Nando_FA14", team: "HRT", pts: 8 },
    { pos: 27, driver: "Krisdemur", team: "Williams", pts: 8 },
    { pos: 28, driver: "Rafale", team: "McLaren", pts: 6 },
    { pos: 29, driver: "TheAgus60", team: "McLaren", pts: 5 },
    { pos: 30, driver: "J-DOT", team: "McLaren", pts: 2 },
    { pos: 31, driver: "N. Duro", team: "Ferrari", pts: 1 },
    { pos: 32, driver: "TucnakCZE", team: "Force India", pts: 0 },
    { pos: 33, driver: "ElNando", team: "Force India", pts: 0 },
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
    { driver: "Dadaaliro", team: "Lotus" },
    { driver: "Nando_FA14", team: "HRT" },
    { driver: "Krisdemur", team: "Williams" },
    { driver: "Rafale", team: "McLaren" },
    { driver: "TheAgus60", team: "McLaren" },
    { driver: "J-DOT", team: "McLaren" },
    { driver: "N. Duro", team: "Ferrari" },
    { driver: "TucnakCZE", team: "Force India" },
    { driver: "ElNando", team: "Force India" },
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

const defaultSettings = {
    discordUrl: "https://discord.gg/4k8kPsP6Mb",
    xUrl: "https://x.com/F0RMULAF4CTOR",
    instagramUrl: "https://www.instagram.com/formulafactorchampionship",
    season: "01",
    rounds: "15",
    drivers: "44"
};

// Admin UI Selectors
const adminBtn = document.getElementById("adminBtn");

const adminAuthOverlay = document.getElementById("adminAuthOverlay");
const adminAuthClose = document.getElementById("adminAuthClose");
const adminLoginForm = document.getElementById("adminLoginForm");
const adminPasswordInput = document.getElementById("adminPasswordInput");
const togglePasswordBtn = document.getElementById("togglePasswordBtn");
const adminLoginError = document.getElementById("adminLoginError");
const adminLoginCancel = document.getElementById("adminLoginCancel");

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
const adminStandingsTableBody = document.getElementById("adminStandingsTableBody");
const adminAddDriverBtn = document.getElementById("adminAddDriverBtn");
const adminSaveStandingsBtn = document.getElementById("adminSaveStandingsBtn");
const standingsSaveNotice = document.getElementById("standingsSaveNotice");

// Settings Elements
const generalSettingsForm = document.getElementById("generalSettingsForm");
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

// Helper: Check Admin Authentication
function isAdminAuthenticated() {
    return sessionStorage.getItem("ffc_admin_auth") === "true";
}

// Modal Handlers
function openAdminAuthModal() {
    if (!adminAuthOverlay) return;
    adminAuthOverlay.classList.add("active");
    document.body.classList.add("modal-open");
    if (adminPasswordInput) {
        adminPasswordInput.value = "";
        adminPasswordInput.classList.remove("input-error");
        setTimeout(() => adminPasswordInput.focus(), 50);
    }
    if (adminLoginError) {
        adminLoginError.style.display = "none";
    }
}

function closeAdminAuthModal() {
    if (!adminAuthOverlay) return;
    adminAuthOverlay.classList.remove("active");
    if (!adminPanelOverlay || !adminPanelOverlay.classList.contains("active")) {
        document.body.classList.remove("modal-open");
    }
    if (adminPasswordInput) {
        adminPasswordInput.value = "";
        adminPasswordInput.classList.remove("input-error");
    }
    if (adminLoginError) {
        adminLoginError.style.display = "none";
    }
}

function openAdminPanel() {
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
    try {
        const saved = localStorage.getItem("ffc_next_race");
        if (saved) return JSON.parse(saved);
    } catch (e) {
        console.error("Error reading saved next race:", e);
    }
    return defaultNextRace;
}

function renderNextRaceOnPage(race) {
    if (nextRaceRoundEl) nextRaceRoundEl.textContent = race.round;
    if (nextRaceTitleEl) {
        if (race.title.includes(" GP")) {
            nextRaceTitleEl.innerHTML = `${race.title.replace(" GP", "")}<br>GP`;
        } else {
            nextRaceTitleEl.textContent = race.title;
        }
    }
    if (nextRaceLocationEl) {
        if (race.location.includes(" · ")) {
            const parts = race.location.split(" · ");
            nextRaceLocationEl.innerHTML = `${parts[0]} ·<br>${parts[1]}`;
        } else {
            nextRaceLocationEl.textContent = race.location;
        }
    }
    if (nextRaceDateTextEl) {
        if (race.dateText.includes(" CEST")) {
            nextRaceDateTextEl.innerHTML = `${race.dateText.replace(" CEST", "")}<br><span>CEST</span>`;
        } else {
            nextRaceDateTextEl.textContent = race.dateText;
        }
    }
    if (race.dateTime) {
        const parsed = new Date(race.dateTime).getTime();
        if (!isNaN(parsed)) {
            raceDate = parsed;
            updateCountdown();
        }
    }
}

// --- Standings Logic ---
function getSavedStandings() {
    let list = defaultStandings;
    try {
        const saved = localStorage.getItem("ffc_standings");
        if (saved) {
            const parsed = JSON.parse(saved);
            if (Array.isArray(parsed) && parsed.length > 0) {
                list = parsed;
            }
        }
    } catch (e) {
        console.error("Error reading saved standings:", e);
    }

    // Ensure all 44 default drivers exist if user had a previous truncated version
    const existingNames = new Set(list.map(d => d.driver.trim().toLowerCase()));
    const merged = [...list];
    defaultStandings.forEach(d => {
        if (!existingNames.has(d.driver.trim().toLowerCase())) {
            merged.push(d);
        }
    });

    // Synchronize teams with official master driver roster
    const roster = getOfficialDriverRoster();
    const rosterMap = new Map();
    roster.forEach(r => rosterMap.set(r.driver.trim().toLowerCase(), r.team));

    return merged.map(item => {
        const key = item.driver.trim().toLowerCase();
        if (rosterMap.has(key)) {
            return { ...item, team: rosterMap.get(key) };
        }
        return item;
    });
}

function renderStandingsOnPage(drivers) {
    if (!standingsTableBody) return;
    standingsTableBody.innerHTML = "";

    // Sort by points descending
    const sorted = [...drivers].sort((a, b) => Number(b.pts) - Number(a.pts));

    sorted.forEach((d, idx) => {
        const tr = document.createElement("tr");
        if (idx === 0) tr.classList.add("leader");
        if (idx >= 10 && !isStandingsExpanded) {
            tr.classList.add("standings-row-hidden");
        }
        tr.innerHTML = `
            <td>${idx + 1}</td>
            <td>${escapeHtml(d.driver)}</td>
            <td class="${getTeamClass(d.team)}">${escapeHtml(d.team)}</td>
            <td>${Number(d.pts)}</td>
        `;
        standingsTableBody.appendChild(tr);
    });

    updateStandingsToggleUI(sorted.length);
    updateConstructorStandings(sorted);
}

function updateConstructorStandings(driverList) {
    if (!constructorsTableBody) return;

    // Calculate sum of points per team
    const teamPointsMap = {};
    F1_TEAMS.forEach(t => { teamPointsMap[t] = 0; });

    driverList.forEach(d => {
        if (d.team && teamPointsMap[d.team] !== undefined) {
            teamPointsMap[d.team] += Number(d.pts) || 0;
        }
    });

    const constructorRows = F1_TEAMS.map(team => ({
        team,
        pts: teamPointsMap[team] || 0
    }));

    // Sort descending by points
    constructorRows.sort((a, b) => b.pts - a.pts);

    constructorsTableBody.innerHTML = "";
    const leaderPts = constructorRows[0].pts;

    constructorRows.forEach((row, idx) => {
        const tr = document.createElement("tr");
        if (idx === 0) tr.classList.add("leader");
        const diff = idx === 0 ? "—" : (row.pts - leaderPts === 0 ? "0" : `${row.pts - leaderPts}`);
        tr.innerHTML = `
            <td>${idx + 1}</td>
            <td class="${getTeamClass(row.team)}">${escapeHtml(row.team)}</td>
            <td>${row.pts}</td>
            <td>${diff}</td>
        `;
        constructorsTableBody.appendChild(tr);
    });
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

    const sorted = [...drivers].sort((a, b) => Number(b.pts) - Number(a.pts));

    sorted.forEach((d, idx) => {
        const officialTeam = getDriverTeam(d.driver) || d.team || "Independent";
        const tr = document.createElement("tr");
        tr.dataset.index = idx;
        tr.innerHTML = `
            <td style="font-weight: bold; color: var(--gold); text-align: center;">${idx + 1}</td>
            <td><input type="text" class="driver-name-input" value="${escapeHtml(d.driver)}" required></td>
            <td class="team-locked-cell">
                <span class="team-locked-badge ${getTeamClass(officialTeam)}" title="Equipo oficial (Modificable en la pestaña 'Pilotos')">${escapeHtml(officialTeam)}</span>
                <input type="hidden" class="driver-team-input" value="${escapeHtml(officialTeam)}">
            </td>
            <td><input type="number" class="driver-pts-input" value="${Number(d.pts)}" min="0" required></td>
            <td style="text-align: center;"><button type="button" class="admin-remove-btn" title="Eliminar de clasificación">🗑</button></td>
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

    // Wire remove buttons
    adminStandingsTableBody.querySelectorAll(".admin-remove-btn").forEach(btn => {
        btn.addEventListener("click", (e) => {
            const row = e.target.closest("tr");
            if (row) row.remove();
        });
    });
}

// --- Settings Logic ---
function getSavedSettings() {
    try {
        const saved = localStorage.getItem("ffc_settings");
        if (saved) return JSON.parse(saved);
    } catch (e) {
        console.error("Error reading saved settings:", e);
    }
    return defaultSettings;
}

function renderSettingsOnPage(settings) {
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

// --- Race Results Logic ---
function getCustomRaceResults() {
    try {
        const saved = localStorage.getItem("ffc_race_results");
        if (saved) return JSON.parse(saved);
    } catch (e) {
        console.error("Error reading saved race results:", e);
    }
    return {};
}

function initRaceResults() {
    const custom = getCustomRaceResults();
    raceResults = { ...defaultRaceResults, ...custom };
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

    if (card) {
        card.setAttribute("data-race", raceKey);
        card.classList.remove("upcoming", "next");
        card.classList.add("completed", "race-link");
        const statusEl = card.querySelector(".calendar-status");
        if (statusEl) statusEl.textContent = "COMPLETED";

        let hint = card.querySelector(".click-hint");
        if (!hint) {
            hint = document.createElement("span");
            hint.className = "click-hint";
            hint.textContent = "VIEW RESULTS →";
            card.appendChild(hint);
        }

        card.onclick = () => openRace(raceKey);
    }
}

// --- Official Driver Roster Management ---
function getOfficialDriverRoster() {
    try {
        const saved = localStorage.getItem("ffc_driver_roster");
        if (saved) {
            const list = JSON.parse(saved);
            if (Array.isArray(list) && list.length > 0) return list;
        }
    } catch (e) {
        console.error("Error reading saved driver roster:", e);
    }
    return defaultDriverRoster;
}

function saveOfficialDriverRoster(roster) {
    localStorage.setItem("ffc_driver_roster", JSON.stringify(roster));
    // Synchronize teams in saved standings
    const standings = getSavedStandings();
    const rosterMap = new Map();
    roster.forEach(r => rosterMap.set(r.driver.trim().toLowerCase(), r.team));
    const updatedStandings = standings.map(d => {
        const key = d.driver.trim().toLowerCase();
        if (rosterMap.has(key)) {
            return { ...d, team: rosterMap.get(key) };
        }
        return d;
    });
    localStorage.setItem("ffc_standings", JSON.stringify(updatedStandings));

    renderStandingsOnPage(updatedStandings);
    renderAdminStandingsEditor(updatedStandings);
    if (adminSelectRace) populateRaceResultsEditor(adminSelectRace.value);
}

function getDriverTeam(driverName) {
    if (!driverName) return "Independent";
    const roster = getOfficialDriverRoster();
    const found = roster.find(r => r.driver.trim().toLowerCase() === driverName.trim().toLowerCase());
    if (found && found.team) return found.team;
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
        const tr = document.createElement("tr");
        tr.dataset.index = actualIndex;

        let teamOptions = "";
        F1_TEAMS.forEach(team => {
            const isSelected = item.team && item.team.toLowerCase() === team.toLowerCase();
            teamOptions += `<option value="${escapeHtml(team)}" ${isSelected ? "selected" : ""}>${escapeHtml(team)}</option>`;
        });

        tr.innerHTML = `
            <td style="font-weight: bold; color: var(--gold); text-align: center;">${actualIndex + 1}</td>
            <td style="font-weight: 600; color: #fff;">${escapeHtml(item.driver)}</td>
            <td>
                <select class="admin-pilot-team-select" data-driver="${escapeHtml(item.driver)}">
                    ${teamOptions}
                </select>
            </td>
            <td style="text-align: center;">
                <button type="button" class="admin-remove-btn admin-pilot-remove-btn" data-index="${actualIndex}" title="Eliminar piloto del censo">🗑</button>
            </td>
        `;

        adminDriversTableBody.appendChild(tr);
    });

    // Wire remove buttons
    adminDriversTableBody.querySelectorAll(".admin-pilot-remove-btn").forEach(btn => {
        btn.addEventListener("click", () => {
            const idx = Number(btn.dataset.index);
            const currentRoster = getOfficialDriverRoster();
            if (idx >= 0 && idx < currentRoster.length) {
                const removed = currentRoster[idx];
                currentRoster.splice(idx, 1);
                saveOfficialDriverRoster(currentRoster);
                renderAdminDriversTab(adminSearchPilotInput ? adminSearchPilotInput.value : "");
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
    const sorted = [...standings].sort((a, b) => Number(b.pts) - Number(a.pts));
    return sorted.slice(0, 10).map((d, idx) => ({
        pos: idx + 1,
        driver: d.driver,
        team: d.team,
        status: "FINISHED"
    }));
}

function renderRacePositionsTable(list) {
    if (!adminRacePositionsBody) return;
    adminRacePositionsBody.innerHTML = "";

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
            <td style="text-align: center;">
                <button type="button" class="admin-remove-btn race-pos-remove-btn" title="Eliminar posición">🗑</button>
            </td>
        `;

        const driverSelect = tr.querySelector(".race-driver-select");
        const teamBadge = tr.querySelector(".team-locked-badge");
        const teamVal = tr.querySelector(".race-team-val");

        driverSelect.addEventListener("change", () => {
            const val = driverSelect.value;
            const officialTeam = getDriverTeam(val);
            if (teamBadge && teamVal) {
                teamBadge.textContent = officialTeam;
                teamBadge.className = `team-locked-badge ${getTeamClass(officialTeam)}`;
                teamVal.value = officialTeam;
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
    const rows = adminRacePositionsBody.querySelectorAll("tr");
    rows.forEach((row, idx) => {
        const cell = row.querySelector(".pos-cell");
        if (cell) cell.textContent = idx + 1;
    });
}

function populateRaceResultsEditor(raceKey) {
    if (!raceKey) raceKey = "australia";
    const race = raceResults[raceKey] || seasonRacesMeta[raceKey] || {
        round: "ROUND",
        title: raceKey.toUpperCase(),
        location: "",
        date: "TBA",
        winner: "",
        pole: "",
        fastest: "",
        driverDay: "",
        drivers: []
    };

    // Fastest Lap (Vuelta Rápida)
    let fastestDriver = "";
    let fastestTime = "";
    if (race.fastest) {
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
    if (race.pole) {
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
    populateDriverSelect(adminDriverDay, race.driverDay || "", "-- Seleccionar Piloto del Día --");

    // Race Date
    if (adminRaceDateInput) adminRaceDateInput.value = race.date || "";

    // Position rows
    const driversToRender = (race.drivers && race.drivers.length > 0) ? race.drivers : getDefaultTop10Positions();
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

// Initialize on page load
(function initializeSavedData() {
    renderNextRaceOnPage(getSavedNextRace());
    renderStandingsOnPage(getSavedStandings());
    renderSettingsOnPage(getSavedSettings());
    initRaceResults();

    // Language switcher setup
    const langBtnEs = document.getElementById("langBtnEs");
    const langBtnEn = document.getElementById("langBtnEn");

    if (langBtnEs) {
        langBtnEs.addEventListener("click", () => setLanguage("es"));
    }
    if (langBtnEn) {
        langBtnEn.addEventListener("click", () => setLanguage("en"));
    }

    const initialLang = (() => {
        try {
            const saved = localStorage.getItem("ffc_language");
            if (saved === "es" || saved === "en") return saved;
        } catch (e) {}
        return "es";
    })();
    setLanguage(initialLang);
})();

// --- Admin Button Click ---
if (adminBtn) {
    adminBtn.addEventListener("click", () => {
        if (isAdminAuthenticated()) {
            openAdminPanel();
        } else {
            openAdminAuthModal();
        }
    });
}

// --- Login Form Submit ---
if (adminLoginForm) {
    adminLoginForm.addEventListener("submit", (e) => {
        e.preventDefault();
        const pwd = adminPasswordInput ? adminPasswordInput.value.trim() : "";

        if (pwd === ADMIN_PASSWORD) {
            sessionStorage.setItem("ffc_admin_auth", "true");
            closeAdminAuthModal();
            openAdminPanel();
        } else {
            if (adminLoginError) {
                adminLoginError.style.display = "block";
                adminLoginError.textContent = "Contraseña incorrecta. Inténtalo de nuevo.";
            }
            if (adminPasswordInput) {
                adminPasswordInput.classList.add("input-error");
                adminPasswordInput.focus();
            }
        }
    });
}

// Password toggle eye
if (togglePasswordBtn && adminPasswordInput) {
    togglePasswordBtn.addEventListener("click", () => {
        const isPassword = adminPasswordInput.type === "password";
        adminPasswordInput.type = isPassword ? "text" : "password";
        togglePasswordBtn.textContent = isPassword ? "🙈" : "👁";
    });
}

// Modal Closers
if (adminAuthClose) adminAuthClose.addEventListener("click", closeAdminAuthModal);
if (adminLoginCancel) adminLoginCancel.addEventListener("click", closeAdminAuthModal);
if (adminPanelClose) adminPanelClose.addEventListener("click", closeAdminPanel);

if (adminLogoutBtn) {
    adminLogoutBtn.addEventListener("click", () => {
        sessionStorage.removeItem("ffc_admin_auth");
        closeAdminPanel();
    });
}

if (adminAuthOverlay) {
    adminAuthOverlay.addEventListener("click", (e) => {
        if (e.target === adminAuthOverlay) closeAdminAuthModal();
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
    nextRaceForm.addEventListener("submit", (e) => {
        e.preventDefault();
        const updated = {
            round: adminRaceRound.value.trim(),
            title: adminRaceTitle.value.trim(),
            location: adminRaceLocation.value.trim(),
            dateText: adminRaceDateText.value.trim(),
            dateTime: adminRaceDateTime.value
        };

        localStorage.setItem("ffc_next_race", JSON.stringify(updated));
        renderNextRaceOnPage(updated);

        if (raceSaveNotice) {
            raceSaveNotice.textContent = "✓ Próxima carrera guardada con éxito";
            setTimeout(() => { raceSaveNotice.textContent = ""; }, 3000);
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
    adminSaveStandingsBtn.addEventListener("click", () => {
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
                if (name) {
                    list.push({ driver: name, team: officialTeam, pts });
                }
            }
        });

        // Sort descending by points
        list.sort((a, b) => b.pts - a.pts);

        localStorage.setItem("ffc_standings", JSON.stringify(list));
        renderStandingsOnPage(list);
        renderAdminStandingsEditor(list);

        if (standingsSaveNotice) {
            standingsSaveNotice.textContent = "✓ Clasificación actualizada y ordenada";
            setTimeout(() => { standingsSaveNotice.textContent = ""; }, 3000);
        }
    });
}

// Save General Settings
if (generalSettingsForm) {
    generalSettingsForm.addEventListener("submit", (e) => {
        e.preventDefault();
        const settings = {
            discordUrl: adminDiscordUrl ? adminDiscordUrl.value.trim() : "",
            xUrl: adminXUrl ? adminXUrl.value.trim() : "",
            instagramUrl: adminInstagramUrl ? adminInstagramUrl.value.trim() : "",
            season: adminStatSeason ? adminStatSeason.value.trim() : "01",
            rounds: adminStatRounds ? adminStatRounds.value.trim() : "15",
            drivers: adminStatDrivers ? adminStatDrivers.value.trim() : "44"
        };

        localStorage.setItem("ffc_settings", JSON.stringify(settings));
        renderSettingsOnPage(settings);

        if (settingsSaveNotice) {
            settingsSaveNotice.textContent = "✓ Ajustes guardados correctamente";
            setTimeout(() => { settingsSaveNotice.textContent = ""; }, 3000);
        }
    });
}

// --- Pilotos & Equipos Tab Events ---
if (adminSaveDriversBtn) {
    adminSaveDriversBtn.addEventListener("click", () => {
        const selects = document.querySelectorAll(".admin-pilot-team-select");
        const currentRoster = getOfficialDriverRoster();
        const rosterMap = new Map();
        currentRoster.forEach(r => rosterMap.set(r.driver.trim().toLowerCase(), r));

        selects.forEach(sel => {
            const driverName = sel.dataset.driver;
            const newTeam = sel.value;
            if (driverName && rosterMap.has(driverName.trim().toLowerCase())) {
                rosterMap.get(driverName.trim().toLowerCase()).team = newTeam;
            }
        });

        saveOfficialDriverRoster(currentRoster);
        renderAdminDriversTab(adminSearchPilotInput ? adminSearchPilotInput.value : "");

        if (driversSaveNotice) {
            driversSaveNotice.textContent = "✓ Equipos actualizados en todo el campeonato";
            setTimeout(() => { driversSaveNotice.textContent = ""; }, 3000);
        }
    });
}

if (adminNewPilotForm) {
    adminNewPilotForm.addEventListener("submit", (e) => {
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

        currentRoster.push({ driver: name, team });
        saveOfficialDriverRoster(currentRoster);

        // Also add to standings with 0 pts if not present
        const standings = getSavedStandings();
        if (!standings.some(d => d.driver.trim().toLowerCase() === name.toLowerCase())) {
            standings.push({ pos: standings.length + 1, driver: name, team, pts: 0 });
            localStorage.setItem("ffc_standings", JSON.stringify(standings));
            renderStandingsOnPage(standings);
            renderAdminStandingsEditor(standings);
        }

        nameInput.value = "";
        renderAdminDriversTab(adminSearchPilotInput ? adminSearchPilotInput.value : "");

        if (driversSaveNotice) {
            driversSaveNotice.textContent = `✓ Piloto ${name} registrado correctamente`;
            setTimeout(() => { driversSaveNotice.textContent = ""; }, 3000);
        }
    });
}

if (adminSearchPilotInput) {
    adminSearchPilotInput.addEventListener("input", () => {
        renderAdminDriversTab(adminSearchPilotInput.value);
    });
}

// Toggle Standings Rows (Top 10 vs Full)
if (toggleStandingsBtn) {
    toggleStandingsBtn.addEventListener("click", () => {
        isStandingsExpanded = !isStandingsExpanded;
        const saved = getSavedStandings();
        renderStandingsOnPage(saved);
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
        const count = adminRacePositionsBody.querySelectorAll("tr").length + 1;
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
            <td style="text-align: center;">
                <button type="button" class="admin-remove-btn race-pos-remove-btn" title="Eliminar posición">🗑</button>
            </td>
        `;

        const driverSelect = tr.querySelector(".race-driver-select");
        const teamBadge = tr.querySelector(".team-locked-badge");
        const teamVal = tr.querySelector(".race-team-val");

        driverSelect.addEventListener("change", () => {
            const val = driverSelect.value;
            const officialTeam = getDriverTeam(val);
            if (teamBadge && teamVal) {
                teamBadge.textContent = officialTeam;
                teamBadge.className = `team-locked-badge ${getTeamClass(officialTeam)}`;
                teamVal.value = officialTeam;
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

if (raceResultsForm) {
    raceResultsForm.addEventListener("submit", (e) => {
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
            winner: winnerDriver || drivers[0].driver,
            pole: poleDriver && poleTime ? `${poleDriver} · ${poleTime}` : (poleDriver || "TBA"),
            fastest: `${fastestDriver} · ${fastestTime}`,
            driverDay: driverDay || winnerDriver || drivers[0].driver,
            drivers: drivers
        };

        const custom = getCustomRaceResults();
        custom[raceKey] = updatedRace;
        localStorage.setItem("ffc_race_results", JSON.stringify(custom));
        raceResults[raceKey] = updatedRace;

        updateCalendarCardForRace(raceKey, updatedRace);

        if (raceResultsSaveNotice) {
            raceResultsSaveNotice.textContent = `✓ Resultados de ${meta.title} guardados correctamente`;
            raceResultsSaveNotice.style.color = "#3fb950";
            setTimeout(() => { raceResultsSaveNotice.textContent = ""; }, 3500);
        }
    });
}

// Reset to Defaults
if (adminResetDefaultBtn) {
    adminResetDefaultBtn.addEventListener("click", () => {
        localStorage.removeItem("ffc_next_race");
        localStorage.removeItem("ffc_standings");
        localStorage.removeItem("ffc_settings");
        localStorage.removeItem("ffc_race_results");
        localStorage.removeItem("ffc_driver_roster");

        raceResults = { ...defaultRaceResults };
        renderNextRaceOnPage(defaultNextRace);
        renderStandingsOnPage(defaultStandings);
        renderSettingsOnPage(defaultSettings);
        initRaceResults();
        populateAdminForms();

        if (settingsSaveNotice) {
            settingsSaveNotice.textContent = "✓ Datos restablecidos de fábrica";
            setTimeout(() => { settingsSaveNotice.textContent = ""; }, 3000);
        }
    });
}


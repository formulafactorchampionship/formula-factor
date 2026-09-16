/* =========================================================
   FFC — COUNTDOWN
========================================================= */

const raceDate = new Date("2026-09-20T16:30:00+02:00").getTime();

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
   RACE RESULTS DATA
========================================================= */

const raceResults = {

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

        row.innerHTML = `
            <td class="result-position">${driver.pos}</td>
            <td>${driver.driver}</td>
            <td class="${getTeamClass(driver.team)}">${driver.team}</td>
            <td class="${statusClass}">${driver.status}</td>
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

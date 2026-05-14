// Social Rides CPH — rundedrehen.de scraper
// Fetches Copenhagen rides from rundedrehen.de and merges into rides.json

const fs = require("fs");

const URL = "https://rundedrehen.de/grouprides/kopenhagen";
const OUTPUT_FILE = "rides.json";

async function scrape() {
  console.log("Fetching rundedrehen.de/grouprides/kopenhagen...");
  const res = await fetch(URL);
  const html = await res.text();

  const rides = [];
  let currentDate = null;

  // Split by date headers (format: DD.MM.YYYY)
  const lines = html.split("\n").map(l => l.trim()).filter(Boolean);

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    // Match date lines like "16.05.2026"
    const dateMatch = line.match(/^(\d{2})\.(\d{2})\.(\d{4})$/);
    if (dateMatch) {
      currentDate = `${dateMatch[3]}-${dateMatch[2]}-${dateMatch[1]}`; // ISO format
      continue;
    }

    // Match event links: [Title](https://www.strava.com/clubs/ID/group_events/EVENT_ID)
    const eventMatch = line.match(/^\[(.+?)\]\((https:\/\/www\.strava\.com\/clubs\/(\d+)\/group_events\/(\d+))\)$/);
    if (eventMatch && currentDate) {
      const title = eventMatch[1];
      const eventUrl = eventMatch[2];
      const clubId = eventMatch[3];
      const eventId = eventMatch[4];

      // Look ahead for time and location (next 2-3 lines)
      let time = null;
      let location = null;
      let womenOnly = false;

      for (let j = i + 1; j < Math.min(i + 6, lines.length); j++) {
        const next = lines[j];
        const timeMatch = next.match(/^(\d{1,2}(?::\d{2})?\s*Uhr),?\s*(.+)$/);
        if (timeMatch) {
          time = timeMatch[1].replace("Uhr", "").trim();
          location = timeMatch[2].trim();
        }
        if (next.includes("Nur Frauen")) womenOnly = true;
        // Stop if we hit another event or date
        if (next.match(/^\[.+\]\(https:\/\/www\.strava\.com/) || next.match(/^\d{2}\.\d{2}\.\d{4}$/)) break;
      }

      // Format time into ISO date
      let isoDate = currentDate;
      if (time) {
        const [h, m] = time.split(":").map(Number);
        isoDate = `${currentDate}T${String(h).padStart(2, "0")}:${String(m || 0).padStart(2, "0")}:00`;
      }

      rides.push({
        id: `rundedrehen-${eventId}`,
        title,
        source: "rundedrehen",
        club: {
          id: clubId,
          name: lookupClubName(clubId),
          strava_url: `https://www.strava.com/clubs/${clubId}`,
        },
        event_url: eventUrl,
        date: isoDate,
        upcoming_dates: [isoDate],
        location: location ?? null,
        women_only: womenOnly,
        description: "",
        activity_type: "Ride",
        fetched_at: new Date().toISOString(),
      });
    }
  }

  return rides;
}

function lookupClubName(clubId) {
  const known = {
    "299419": "Copenhagen Cycling Club",
    "120055": "Rapha Copenhagen",
    "1048788": "PAS NORMAL STUDIOS - Copenhagen",
  };
  return known[clubId] ?? `Club ${clubId}`;
}

function isUpcoming(ride) {
  const now = new Date();
  return new Date(ride.date) >= now;
}

async function main() {
  console.log("Social Rides CPH — rundedrehen scraper\n");

  const newRides = await scrape();
  const upcoming = newRides.filter(isUpcoming);
  console.log(`  → ${newRides.length} ride(s) found, ${upcoming.length} upcoming`);

  // Load existing rides.json
  let existing = { rides: [] };
  if (fs.existsSync(OUTPUT_FILE)) {
    existing = JSON.parse(fs.readFileSync(OUTPUT_FILE, "utf8"));
  }

  // Remove old rundedrehen entries, add fresh ones
  const stravaRides = existing.rides.filter(r => r.source !== "rundedrehen");
  const merged = [...stravaRides, ...upcoming];

  // Sort by date
  merged.sort((a, b) => new Date(a.date) - new Date(b.date));

  const output = {
    generated_at: new Date().toISOString(),
    total_rides: merged.length,
    rides: merged,
  };

  fs.writeFileSync(OUTPUT_FILE, JSON.stringify(output, null, 2));
  console.log(`✓ Done! ${merged.length} total ride(s) written to ${OUTPUT_FILE}`);
}

main().catch(err => {
  console.error("Error:", err.message);
  process.exit(1);
});

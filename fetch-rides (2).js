// Social Rides CPH — Strava Group Event Fetcher
// Run: node fetch-rides.js
// Output: rides.json

const fs = require("fs");

// ─── CONFIG ────────────────────────────────────────────────────────────────────

const CLIENT_ID = "223804";
const CLIENT_SECRET = "2884930235db46d566f915efa3651dfa048977b6";
const REFRESH_TOKEN = "e5e20ca445a62cc19c051ffbb022918ee1351d88";

// Copenhagen Strava clubs to pull events from.
// Add or remove club IDs here. Format: { id, name }
// To find a club's numeric ID: go to strava.com/clubs/CLUBNAME and note the number in the URL.
const CLUBS = [
  { id: 205018,   name: "PAS NORMAL STUDIOS — ICC Copenhagen" },
  { id: 1048788,  name: "Pas Normal Studios Copenhagen" },
  { id: 120055,   name: "Rapha Cycle Club Copenhagen" },
  { id: 557816,   name: "Mikkeller Cycling Club Copenhagen" },
  { id: 1383419,  name: "Nordic Chase" },
  { id: 299338,   name: "Copenhagen Business School Cycling Club" },
  { id: 1450886,  name: "Cykling for alle" },
  { id: 1550992,  name: "Leberkäsebanden" },
  { id: 609245,   name: "6am CC Copenhagen" },
  { id: 394526,   name: "Nørrebro Cykleklub" },
  { id: 502279,   name: "Cranks Cycling Club" },
  { id: 299419,   name: "Copenhagen CC" },
  // Add more clubs here:
  // { id: 123456, name: "Your Club Name" },
];

const OUTPUT_FILE = "rides.json";

// ─── HELPERS ───────────────────────────────────────────────────────────────────

async function getAccessToken() {
  const res = await fetch("https://www.strava.com/oauth/token", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      client_id: CLIENT_ID,
      client_secret: CLIENT_SECRET,
      refresh_token: REFRESH_TOKEN,
      grant_type: "refresh_token",
    }),
  });
  const data = await res.json();
  if (!data.access_token) {
    throw new Error("Failed to get access token: " + JSON.stringify(data));
  }
  console.log("✓ Got access token (expires in", Math.round(data.expires_in / 60), "min)");
  return data.access_token;
}

async function getClubEvents(clubId, accessToken) {
  const res = await fetch(
    `https://www.strava.com/api/v3/clubs/${clubId}/group_events`,
    { headers: { Authorization: `Bearer ${accessToken}` } }
  );

  if (res.status === 403) {
    console.warn(`  ⚠ Club ${clubId}: access denied (you may need to join this club first)`);
    return [];
  }
  if (!res.ok) {
    console.warn(`  ⚠ Club ${clubId}: HTTP ${res.status}`);
    return [];
  }

  const events = await res.json();
  return Array.isArray(events) ? events : [];
}

function formatEvent(event, club) {
  // Build location from address fields Strava returns
  const addr = event.address ?? {};
  const locationParts = [
    addr.address1,
    addr.city,
    addr.state,
    addr.country,
  ].filter(Boolean);
  const location = locationParts.length > 0 ? locationParts.join(", ") : null;

  return {
    id: event.id,
    title: event.title,
    source: "strava",
    club: {
      id: club.id,
      name: club.name,
      strava_url: `https://www.strava.com/clubs/${club.id}`,
    },
    event_url: `https://www.strava.com/clubs/${club.id}/group_events/${event.id}`,
    date: event.upcoming_occurrences?.[0] ?? event.start_date,
    upcoming_dates: event.upcoming_occurrences ?? [],
    location: location,
    description: event.description ?? "",
    activity_type: event.activity_type,
    route_id: event.route_id ?? null,
    women_only: event.women_only ?? false,
    skill_levels: event.skill_levels ?? [],
    terrain: event.terrain ?? [],
    fetched_at: new Date().toISOString(),
  };
}

function isUpcoming(event) {
  // Keep only events with at least one upcoming occurrence in the future
  const now = new Date();
  const dates = event.upcoming_occurrences ?? [];
  if (dates.length > 0) {
    return dates.some(d => new Date(d) >= now);
  }
  // Fall back to start_date
  if (event.start_date) return new Date(event.start_date) >= now;
  return false;
}

// ─── MAIN ──────────────────────────────────────────────────────────────────────

async function main() {
  console.log("Social Rides CPH — Strava Fetcher\n");

  const accessToken = await getAccessToken();
  const allRides = [];

  for (const club of CLUBS) {
    console.log(`Fetching events from: ${club.name} (${club.id})`);
    const events = await getClubEvents(club.id, accessToken);
    console.log(`  → ${events.length} event(s) found`);

    for (const event of events) {
      if (isUpcoming(event)) allRides.push(formatEvent(event, club));
    }
  }

  // Sort by next upcoming date
  allRides.sort((a, b) => {
    const dateA = a.date ? new Date(a.date) : new Date(9999, 0);
    const dateB = b.date ? new Date(b.date) : new Date(9999, 0);
    return dateA - dateB;
  });

  // Write output
  const output = {
    generated_at: new Date().toISOString(),
    total_rides: allRides.length,
    clubs_checked: CLUBS.length,
    rides: allRides,
  };

  fs.writeFileSync(OUTPUT_FILE, JSON.stringify(output, null, 2));
  console.log(`\n✓ Done! ${allRides.length} ride(s) written to ${OUTPUT_FILE}`);
}

main().catch((err) => {
  console.error("Error:", err.message);
  process.exit(1);
});

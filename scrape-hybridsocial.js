// Social Rides CPH — Hybrid Social scraper
// Scrapes rides from Hybrid Social's Linktree page and merges into rides.json

const fs = require("fs");

const LINKTREE_URL = "https://linktr.ee/hybridsocialcph";
const OUTPUT_FILE = "rides.json";
const CLUB_NAME = "Hybrid Social CPH";

async function scrape() {
  console.log("Fetching Hybrid Social Linktree...");
  const res = await fetch(LINKTREE_URL, {
    headers: {
      "User-Agent": "Mozilla/5.0 (compatible; SocialRidesCPH/1.0)",
    },
  });
  const html = await res.text();

  const rides = [];

  // Extract JSON data embedded in the page (Linktree embeds __NEXT_DATA__)
  const nextDataMatch = html.match(/<script id="__NEXT_DATA__"[^>]*>([\s\S]*?)<\/script>/);
  if (nextDataMatch) {
    try {
      const nextData = JSON.parse(nextDataMatch[1]);
      const links = nextData?.props?.pageProps?.account?.links ?? [];

      for (const link of links) {
        const title = link.title ?? "";
        const url = link.url ?? "";
        const description = link.description ?? "";

        // Only grab Luma event links
        if (!url.includes("luma.com")) continue;

        // Parse date from title — format: "DD.MM.YY" or "DD.MM.YYYY"
        const dateMatch = title.match(/^(\d{2})\.(\d{2})\.(\d{2,4})/);
        if (!dateMatch) continue;

        const day = dateMatch[1];
        const month = dateMatch[2];
        let year = dateMatch[3];
        if (year.length === 2) year = "20" + year;

        const isoDate = `${year}-${month}-${day}`;
        const eventTitle = title.replace(/^\d{2}\.\d{2}\.\d{2,4}\s*[—-]\s*/, "").trim();

        rides.push({
          id: `hybridsocial-${url.split("/").pop()}`,
          title: eventTitle,
          source: "hybridsocial",
          club: {
            id: "hybridsocialcph",
            name: CLUB_NAME,
            strava_url: "https://www.instagram.com/hybridsocialcph",
          },
          event_url: url,
          date: isoDate,
          upcoming_dates: [isoDate],
          location: "Mosehuset, Copenhagen",
          description: description,
          activity_type: "Ride",
          women_only: true,
          fetched_at: new Date().toISOString(),
        });
      }
    } catch (e) {
      console.warn("  ⚠ Could not parse __NEXT_DATA__, falling back to HTML parsing");
    }
  }

  // Fallback: parse links directly from HTML if __NEXT_DATA__ didn't work
  if (rides.length === 0) {
    console.log("  Trying HTML fallback...");
    const linkRegex = /href="(https:\/\/luma\.com\/[^"]+)"[^>]*>([^<]+)/g;
    let match;
    while ((match = linkRegex.exec(html)) !== null) {
      const url = match[1];
      const rawTitle = match[2].trim();
      const dateMatch = rawTitle.match(/^(\d{2})\.(\d{2})\.(\d{2,4})/);
      if (!dateMatch) continue;

      const day = dateMatch[1];
      const month = dateMatch[2];
      let year = dateMatch[3];
      if (year.length === 2) year = "20" + year;

      const isoDate = `${year}-${month}-${day}`;
      const eventTitle = rawTitle.replace(/^\d{2}\.\d{2}\.\d{2,4}\s*[—-]\s*/, "").trim();

      rides.push({
        id: `hybridsocial-${url.split("/").pop()}`,
        title: eventTitle,
        source: "hybridsocial",
        club: {
          id: "hybridsocialcph",
          name: CLUB_NAME,
          strava_url: "https://www.instagram.com/hybridsocialcph",
        },
        event_url: url,
        date: isoDate,
        upcoming_dates: [isoDate],
        location: "Mosehuset, Copenhagen",
        description: "",
        activity_type: "Ride",
        women_only: true,
        fetched_at: new Date().toISOString(),
      });
    }
  }

  return rides;
}

function isUpcoming(ride) {
  const now = new Date();
  const ninetyDaysFromNow = new Date(now.getTime() + 90 * 24 * 60 * 60 * 1000);
  const date = new Date(ride.date);
  return date >= now && date <= ninetyDaysFromNow;
}

async function main() {
  console.log("Social Rides CPH — Hybrid Social scraper\n");

  const newRides = await scrape();
  const upcoming = newRides.filter(isUpcoming);
  console.log(`  → ${newRides.length} ride(s) found, ${upcoming.length} upcoming`);

  // Load existing rides.json
  let existing = { rides: [] };
  if (fs.existsSync(OUTPUT_FILE)) {
    existing = JSON.parse(fs.readFileSync(OUTPUT_FILE, "utf8"));
  }

  // Remove old hybridsocial entries, add fresh ones
  const otherRides = existing.rides.filter(r => r.source !== "hybridsocial");
  const merged = [...otherRides, ...upcoming];

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

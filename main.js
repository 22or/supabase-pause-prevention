require('dotenv').config(); // Load environment variables from .env file

const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function fetchEvents() {
  const { data, error } = await supabase.from("events").select("*");

  if (error) {
    console.error("Error fetching events:", error);
  } else {
    console.log("Fetched events");
  }
}

fetchEvents();
setInterval(fetchEvents,1000 * 60 * 60 * 24); // Fetch events every 24 hours
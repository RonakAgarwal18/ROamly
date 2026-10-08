import { readEnv } from '../app-config';
import { seedDocumentProviders } from './document-provider-seed';

import Database from 'better-sqlite3';
import crypto from 'crypto';

// bcrypt cost factor for the seeded admin password — kept in sync with authService.
const BCRYPT_COST = 12;

// Seeds run at startup before the DB admin panel can be used, so only env vars
// are checked here. The granular password_login/password_registration DB toggles
// are only relevant after the first user exists; at that point seeds have already
// finished and skip via the userCount > 0 guard above.
function isOidcOnlyConfigured(): boolean {
  const oidc = readEnv().oidc;
  if (!oidc.only) return false;
  return !!(oidc.issuer && oidc.clientId);
}

function seedAdminAccount(db: Database.Database): void {
  try {
    const env_admin_email = readEnv().adminBootstrap.email;
    const env_admin_pw = readEnv().adminBootstrap.password;
    const adminEnvProvided = !!(env_admin_email || env_admin_pw);

    const userCount = (db.prepare('SELECT COUNT(*) as count FROM users').get() as { count: number }).count;
    if (userCount > 0) {
      // ADMIN_EMAIL/ADMIN_PASSWORD only take effect on the first run (empty database). Once a
      // user exists they are silently ignored — a common trip-up: people add the vars after the
      // fact, restart, nothing changes, and there is no hint why. Say so instead of staying silent.
      if (adminEnvProvided) {
        console.warn(
          '[admin] ADMIN_EMAIL/ADMIN_PASSWORD are set, but users already exist — these only apply on first run (empty database) and are being ignored.',
        );
        console.warn(
          '[admin] Change an existing password from Settings after signing in, reset the admin (see the Troubleshooting wiki), or start with an empty data volume to re-run setup.',
        );
      }
      return;
    }

    // Demo mode seeds its own admin (admin@roamly.app, username 'admin') right after this.
    // Creating a first-run admin here would grab username 'admin' first and make the demo
    // seeder fail on the UNIQUE(username) constraint, leaving the demo user uncreated.
    if (readEnv().demo.enabled) return;

    if (isOidcOnlyConfigured()) {
      console.log('');
      console.log('╔══════════════════════════════════════════════╗');
      console.log('║  ROamly — OIDC-Only Mode                       ║');
      console.log('║  First SSO login will become admin.           ║');
      console.log('╚══════════════════════════════════════════════╝');
      console.log('');
      return;
    }

    const bcrypt = require('bcryptjs');

    let password: string;
    let email: string;
    if (env_admin_email && env_admin_pw) {
      password = env_admin_pw;
      email = env_admin_email;
    } else {
      // A partial config (only one of the two) is an easy mistake: neither value is used and a
      // generated password is created instead. Flag it so the chosen credentials silently not
      // working isn't a surprise.
      if (adminEnvProvided) {
        console.warn(
          '[admin] Only one of ADMIN_EMAIL/ADMIN_PASSWORD is set — both are required for a custom admin. Falling back to admin@roamly.local with a generated password (shown below).',
        );
      }
      password = crypto.randomBytes(12).toString('base64url');
      email = 'admin@roamly.local';
    }

    const hash = bcrypt.hashSync(password, BCRYPT_COST);
    const username = 'admin';

    db.prepare(
      'INSERT INTO users (username, email, password_hash, role, must_change_password) VALUES (?, ?, ?, ?, 1)',
    ).run(username, email, hash, 'admin');

    console.log('');
    console.log('╔══════════════════════════════════════════════╗');
    console.log('║  ROamly — First Run: Admin Account Created     ║');
    console.log('╠══════════════════════════════════════════════╣');
    console.log(`║  Email:    ${email.padEnd(33)}║`);
    console.log(`║  Password: ${password.padEnd(33)}║`);
    console.log('╚══════════════════════════════════════════════╝');
    console.log('');
  } catch (err: unknown) {
    console.error('[ERROR] Error seeding admin account:', err instanceof Error ? err.message : err);
  }
}

function seedCategories(db: Database.Database): void {
  try {
    const existingCats = db.prepare('SELECT COUNT(*) as count FROM categories').get() as { count: number };
    if (existingCats.count === 0) {
      const defaultCategories = [
        { name: 'Hotel', color: '#3b82f6', icon: '🏨' },
        { name: 'Restaurant', color: '#ef4444', icon: '🍽️' },
        { name: 'Attraction', color: '#8b5cf6', icon: '🏛️' },
        { name: 'Shopping', color: '#f59e0b', icon: '🛍️' },
        { name: 'Transport', color: '#6b7280', icon: '🚌' },
        { name: 'Activity', color: '#10b981', icon: '🎯' },
        { name: 'Bar/Cafe', color: '#f97316', icon: '☕' },
        { name: 'Beach', color: '#06b6d4', icon: '🏖️' },
        { name: 'Nature', color: '#84cc16', icon: '🌿' },
        { name: 'Other', color: '#6366f1', icon: '📍' },
      ];
      const insertCat = db.prepare('INSERT INTO categories (name, color, icon) VALUES (?, ?, ?)');
      for (const cat of defaultCategories) insertCat.run(cat.name, cat.color, cat.icon);
      console.log('Default categories seeded');
    }
  } catch (err: unknown) {
    console.error('Error seeding categories:', err instanceof Error ? err.message : err);
  }
}

function seedAddons(db: Database.Database): void {
  try {
    const defaultAddons = [
      {
        id: 'packing',
        name: 'Lists',
        description: 'Packing lists and to-do tasks for your trips',
        type: 'trip',
        icon: 'ListChecks',
        enabled: 1,
        sort_order: 0,
      },
      {
        id: 'budget',
        name: 'Costs',
        description: 'Track and split trip expenses',
        type: 'trip',
        icon: 'Wallet',
        enabled: 1,
        sort_order: 1,
      },
      {
        id: 'documents',
        name: 'Documents',
        description: 'Store and manage travel documents',
        type: 'trip',
        icon: 'FileText',
        enabled: 1,
        sort_order: 2,
      },
      {
        id: 'vacay',
        name: 'Vacay',
        description: 'Personal vacation day planner with calendar view',
        type: 'global',
        icon: 'CalendarDays',
        enabled: 1,
        sort_order: 10,
      },
      {
        id: 'atlas',
        name: 'Atlas',
        description: 'World map of your visited countries with travel stats',
        type: 'global',
        icon: 'Globe',
        enabled: 1,
        sort_order: 11,
      },
      {
        id: 'mcp',
        name: 'MCP',
        description: 'Model Context Protocol for AI assistant integration',
        type: 'integration',
        icon: 'Terminal',
        enabled: 0,
        sort_order: 12,
      },
      {
        id: 'naver_list_import',
        name: 'Naver List Import',
        description: 'Import places from a shared Naver Maps list',
        type: 'integration',
        icon: 'Link2',
        enabled: 1,
        sort_order: 13,
      },
      {
        id: 'collab',
        name: 'Collab',
        description: 'Notes, polls, and live chat for trip collaboration',
        type: 'trip',
        icon: 'Users',
        enabled: 1,
        sort_order: 6,
      },
      {
        id: 'roadtrip',
        name: 'Road trip',
        description: 'Drives with stops along the route, driving times, and arrival times that update themselves',
        type: 'trip',
        icon: 'Route',
        enabled: 0,
        sort_order: 7,
      },
      {
        id: 'journey',
        name: 'Journey',
        description: 'Trip tracking & travel journal — check-ins, photos, daily stories',
        type: 'global',
        icon: 'Compass',
        enabled: 0,
        sort_order: 35,
      },
      {
        id: 'airtrail',
        name: 'AirTrail',
        description: 'Sync flights from your AirTrail instance',
        type: 'integration',
        icon: 'Plane',
        enabled: 0,
        sort_order: 14,
      },
      {
        id: 'dawarich',
        name: 'Dawarich',
        description:
          'Read visits and recorded routes from your Dawarich instance — suggested journal entries, places and countries you confirm yourself',
        type: 'integration',
        icon: 'Dawarich',
        enabled: 0,
        sort_order: 17,
      },
      {
        id: 'llm_parsing',
        name: 'AI Parsing',
        description: 'LLM fallback for booking imports kitinerary cannot read',
        type: 'integration',
        icon: 'Sparkles',
        enabled: 0,
        sort_order: 15,
      },
      {
        id: 'collections',
        name: 'Collections',
        description:
          'Personal place library — save places across trips into named lists, copy into any trip, share with others',
        type: 'global',
        icon: 'Bookmark',
        enabled: 0,
        sort_order: 16,
      },
    ];
    const insertAddon = db.prepare(
      'INSERT OR IGNORE INTO addons (id, name, description, type, icon, enabled, sort_order) VALUES (?, ?, ?, ?, ?, ?, ?)',
    );
    for (const a of defaultAddons)
      insertAddon.run(a.id, a.name, a.description, a.type, a.icon, a.enabled, a.sort_order);

    const providerRows = [
      {
        id: 'immich',
        name: 'Immich',
        description: 'Immich photo provider',
        icon: 'Image',
        enabled: 0,
        sort_order: 0,
      },
      {
        id: 'synologyphotos',
        name: 'Synology Photos',
        description: 'Synology Photos integration with separate account settings',
        icon: 'Image',
        enabled: 0,
        sort_order: 1,
      },
    ];
    const insertProvider = db.prepare(
      'INSERT OR IGNORE INTO photo_providers (id, name, description, icon, enabled, sort_order) VALUES (?, ?, ?, ?, ?, ?)',
    );
    for (const p of providerRows) insertProvider.run(p.id, p.name, p.description, p.icon, p.enabled, p.sort_order);

    const providerFields = [
      {
        provider_id: 'immich',
        field_key: 'immich_url',
        label: 'providerUrl',
        input_type: 'url',
        placeholder: 'https://immich.example.com',
        hint: null,
        required: 1,
        secret: 0,
        settings_key: 'immich_url',
        payload_key: 'immich_url',
        sort_order: 0,
      },
      {
        provider_id: 'immich',
        field_key: 'immich_api_key',
        label: 'providerApiKey',
        input_type: 'password',
        placeholder: 'API Key',
        hint: null,
        required: 1,
        secret: 1,
        settings_key: null,
        payload_key: 'immich_api_key',
        sort_order: 1,
      },
      {
        provider_id: 'immich',
        field_key: 'immich_allow_insecure_tls',
        label: 'skipSSLVerification',
        input_type: 'checkbox',
        placeholder: null,
        hint: null,
        required: 0,
        secret: 0,
        settings_key: 'allow_insecure_tls',
        payload_key: 'allow_insecure_tls',
        sort_order: 2,
      },
      {
        provider_id: 'immich',
        field_key: 'immich_auto_upload',
        label: 'immichAutoUpload',
        input_type: 'checkbox',
        placeholder: null,
        hint: null,
        required: 0,
        secret: 0,
        settings_key: 'auto_upload',
        payload_key: 'auto_upload',
        sort_order: 5,
      },
      {
        provider_id: 'synologyphotos',
        field_key: 'synology_url',
        label: 'providerUrl',
        input_type: 'url',
        placeholder: 'https://synology.example.com/photo',
        hint: 'providerUrlHintSynology',
        required: 1,
        secret: 0,
        settings_key: 'synology_url',
        payload_key: 'synology_url',
        sort_order: 0,
      },
      {
        provider_id: 'synologyphotos',
        field_key: 'synology_username',
        label: 'providerUsername',
        input_type: 'text',
        placeholder: 'Username',
        hint: null,
        required: 1,
        secret: 0,
        settings_key: 'synology_username',
        payload_key: 'synology_username',
        sort_order: 1,
      },
      {
        provider_id: 'synologyphotos',
        field_key: 'synology_password',
        label: 'providerPassword',
        input_type: 'password',
        placeholder: 'Password',
        hint: null,
        required: 1,
        secret: 1,
        settings_key: null,
        payload_key: 'synology_password',
        sort_order: 2,
      },
      {
        provider_id: 'synologyphotos',
        field_key: 'synology_otp',
        label: 'providerOTP',
        input_type: 'text',
        placeholder: '123456',
        hint: null,
        required: 0,
        secret: 0,
        settings_key: null,
        payload_key: 'synology_otp',
        sort_order: 3,
      },
      {
        provider_id: 'synologyphotos',
        field_key: 'synology_skip_ssl',
        label: 'skipSSLVerification',
        input_type: 'checkbox',
        placeholder: null,
        hint: null,
        required: 0,
        secret: 0,
        settings_key: 'synology_skip_ssl',
        payload_key: 'synology_skip_ssl',
        sort_order: 4,
      },
    ];
    const insertProviderField = db.prepare(
      'INSERT OR IGNORE INTO photo_provider_fields (provider_id, field_key, label, input_type, placeholder, hint, required, secret, settings_key, payload_key, sort_order) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
    );
    for (const f of providerFields) {
      insertProviderField.run(
        f.provider_id,
        f.field_key,
        f.label,
        f.input_type,
        f.placeholder,
        f.hint,
        f.required,
        f.secret,
        f.settings_key,
        f.payload_key,
        f.sort_order,
      );
    }

    // Document providers live in their own pair of tables (see the migration
    // for why they are not a `kind` column on photo_providers). Seeded from the
    // same helper the migration uses, so a fresh install and an upgraded one
    // agree.
    seedDocumentProviders(db);

    console.log('Default addons seeded');
  } catch (err: unknown) {
    console.error('Error seeding addons:', err instanceof Error ? err.message : err);
  }
}

// ---------------------------------------------------------------------------
// Sikkim Expedition seed (Oct 11–18, 2026)
//
// One fully-built trip on fresh installs so a new ROamly instance opens with
// real content. Idempotent on the trip title: re-running seeds (or the demo
// seeder, which calls this too) never duplicates it. Skipped in tests — unit
// tests import the real DB module and count rows, so an unseeded trip would
// break their assertions. The owner is the first user (the fresh-install
// admin); the eight travelers get user accounts (reused when they already
// exist) and trip memberships.
// ---------------------------------------------------------------------------

const SIKKIM_TRIP_TITLE = 'Sikkim Expedition';
const SIKKIM_TRAVELERS = ['Ronak', 'Hemant', 'Anmol', 'Abhilash', 'Rishi', 'Vivek', 'Shruti', 'Shraddha'];

// Coordinates are only set where verified — never invented.
const COORDS = {
  temi: { lat: 27.24352, lng: 88.4302 },
  namchi: { lat: 27.16699, lng: 88.36545 },
  ravangla: { lat: 27.30434, lng: 88.36286 },
  singtam: { lat: 27.2325, lng: 88.49851 },
} as const;

interface SikkimSeedPlace {
  name: string;
  time?: string;
  endTime?: string;
  duration?: number;
  note?: string;
  lat?: number;
  lng?: number;
}

interface SikkimSeedDay {
  date: string;
  title: string;
  notes?: string;
  places: SikkimSeedPlace[];
}

const SIKKIM_DAYS: SikkimSeedDay[] = [
  {
    date: '2026-10-11',
    title: 'Arrival + Bolero Hunt',
    places: [
      {
        name: 'SNT bus Siliguri → Gangtok',
        time: '09:00',
        duration: 300,
        note: 'Departs 9:00 AM; reach Gangtok by afternoon.',
      },
      { name: 'Hotel check-in', time: '14:00', duration: 60 },
      { name: 'Group gym session', time: '16:00', duration: 60 },
      {
        name: 'Deorali / Vajra taxi stands',
        time: '17:00',
        duration: 120,
        note: 'Negotiate 5-day Bolero Maxx (Oct 14–18); target ₹26,000–28,000.',
      },
      { name: 'MG Marg evening walk + street food', lat: 27.3289661, lng: 88.6123515, time: '19:00', duration: 120 },
    ],
  },
  {
    date: '2026-10-12',
    title: 'Scooty Run 1',
    places: [
      { name: 'Rent 4 scooties', time: '09:00', duration: 30 },
      { name: 'Rumtek Monastery', lat: 27.2887582, lng: 88.56142, time: '10:00', duration: 120 },
      { name: 'Tashi View Point', lat: 27.352, lng: 88.618, time: '14:00', duration: 60 },
      { name: 'Ganesh Tok', lat: 27.3416128, lng: 88.6213353, time: '16:30', duration: 90, note: 'Kanchenjunga sunset.' },
      { name: 'MG Marg cafe-hopping + dinner', lat: 27.3289661, lng: 88.6123515, time: '19:00', duration: 150 },
    ],
  },
  {
    date: '2026-10-13',
    title: 'Scooty Run 2 + Permit Handover',
    notes: 'Pack tonight for the 7:30 AM departure.',
    places: [
      { name: 'Banjhakri Falls & Energy Park', lat: 27.3507896, lng: 88.6036489, time: '09:30', duration: 150 },
      { name: "Baker's Cafe", time: '13:00', duration: 60 },
      { name: 'Cafe Fiction', time: '14:30', duration: 60 },
      {
        name: 'Deorali — meet Bolero driver',
        time: '15:30',
        endTime: '17:00',
        note: 'Hand over 6 IDs + photos for Nathula permits (critical).',
      },
    ],
  },
  {
    date: '2026-10-14',
    title: 'The Split',
    places: [
      { name: 'Depart Gangtok (Bolero, Group A of 6)', time: '07:30', duration: 30 },
      { name: 'Tsomgo Lake', lat: 27.3745308, lng: 88.7619799, time: '09:30', endTime: '10:30', note: '12,310 ft.' },
      { name: 'Nathu La Pass', lat: 27.3868289, lng: 88.8308961, time: '11:00', endTime: '12:30', note: '14,140 ft.' },
      { name: 'Old Baba Mandir', lat: 27.328, lng: 88.818, time: '13:00', endTime: '14:00' },
      { name: 'Kupup Lake', lat: 27.3301685, lng: 88.8461962, time: '14:00', endTime: '16:15' },
      { name: 'Gnathang Valley sunset', lat: 27.2989658, lng: 88.8177593, time: '16:30', endTime: '17:15', note: '13,500 ft.' },
      { name: 'Zuluk homestay', lat: 27.254, lng: 88.782, time: '18:30', note: 'Bukhari heater, stargazing.' },
      { name: 'Shared Sumo Deorali → Namchi (Group B of 2)', time: '11:00', duration: 180 },
      { name: 'Check in near Namchi Central Park', lat: 27.3031019, lng: 88.3785961, time: '14:00', duration: 30, ...COORDS.namchi },
      { name: 'Namchi Central Park, bakeries, coffee', lat: 27.3031019, lng: 88.3785961, time: '15:00', duration: 180, ...COORDS.namchi },
    ],
  },
  {
    date: '2026-10-15',
    title: 'The Reunion',
    places: [
      { name: 'Thambi Viewpoint sunrise', lat: 27.2657607, lng: 88.7853898, time: '05:00', endTime: '06:15' },
      { name: 'Descend Zuluk → Rongli → Singtam', lat: 27.20352, lng: 88.70087, time: '06:30', endTime: '10:45' },
      { name: 'Singtam → Namchi drive', lat: 27.2319975, lng: 88.4970841, time: '10:45', endTime: '12:00', ...COORDS.singtam },
      {
        name: 'REUNION at Namchi Central Park',
        time: '12:00',
        duration: 30,
        note: 'All 8 in the Bolero.',
        ...COORDS.namchi,
      },
      { name: 'Samdruptse Hill', lat: 27.1818424, lng: 88.3833145, time: '12:30', endTime: '13:30', note: '118-ft statue.' },
      { name: 'Char Dham + lunch', lat: 27.174, lng: 88.382, time: '13:45', endTime: '15:30' },
      { name: 'Drive to Temi', time: '15:30', endTime: '16:15' },
      { name: 'Temi Tea Garden', lat: 27.234, lng: 88.418, time: '16:15', endTime: '17:00', ...COORDS.temi },
      { name: 'Temi → Ravangla', lat: 27.3051271, lng: 88.3644723, time: '17:00', endTime: '17:45' },
      { name: 'Buddha Park (floodlit)', lat: 27.3116732, lng: 88.3635699, time: '19:00', duration: 60, ...COORDS.ravangla },
    ],
  },
  {
    date: '2026-10-16',
    title: 'Ravangla → Pelling',
    places: [
      { name: 'Buddha Park', lat: 27.3116732, lng: 88.3635699, time: '09:00', endTime: '10:30', ...COORDS.ravangla },
      { name: 'Drive to Pelling + lunch', lat: 27.3003722, lng: 88.2356503, time: '10:45', endTime: '12:45' },
      { name: 'Pelling Skywalk + Chenrezig statue', lat: 27.298, lng: 88.238, time: '14:30', endTime: '16:00' },
      { name: 'Sanghak Choeling Monastery', lat: 27.2969077, lng: 88.2180323, time: '16:00', endTime: '17:00' },
      { name: 'Helipad sunset', time: '17:15', endTime: '18:00' },
      { name: 'Dinner + Upper Pelling stroll', time: '19:30', duration: 120 },
    ],
  },
  {
    date: '2026-10-17',
    title: 'Northern Circuit',
    places: [
      { name: 'Rimbi Waterfalls', lat: 27.3132467, lng: 88.1905497, time: '09:15', endTime: '09:45' },
      { name: 'Rimbi Orange Garden', lat: 27.31476, lng: 88.18589, time: '09:45', endTime: '10:30' },
      { name: 'Kanchenjunga Falls', lat: 27.318, lng: 88.195, time: '11:00', endTime: '12:15' },
      { name: 'Khecheopalri Lake', lat: 27.3499171, lng: 88.1883298, time: '12:45', endTime: '14:00' },
      { name: 'Yuksom', lat: 27.3692431, lng: 88.2184825, time: '14:30', endTime: '16:00' },
      { name: 'Farewell dinner', time: '19:30', duration: 150, note: 'Back in Pelling.' },
    ],
  },
  {
    date: '2026-10-18',
    title: 'Heritage + NJP Drop',
    places: [
      { name: 'Pemayangtse Monastery', lat: 27.302, lng: 88.252, time: '08:00', endTime: '09:00' },
      { name: 'Rabdentse Ruins', lat: 27.3020013, lng: 88.2563387, time: '09:15', endTime: '10:30' },
      { name: 'Bird Park', time: '10:30', endTime: '11:00' },
      { name: 'Depart via Legship → Jorethang → Melli', time: '11:00', duration: 315 },
      { name: 'NJP', time: '16:15', endTime: '16:30' },
      { name: 'Train 13173', time: '18:05', duration: 60, note: 'Kanchenjunga Exp; departs NJP 6:05 PM.' },
    ],
  },
];

function seedSikkimTrip(db: Database.Database): void {
  if (readEnv().app.isTest) return;
  try {
    const existing = db.prepare('SELECT id FROM trips WHERE title = ?').get(SIKKIM_TRIP_TITLE) as
      | { id: number }
      | undefined;
    if (existing) return;

    const owner = db.prepare('SELECT id FROM users ORDER BY id ASC LIMIT 1').get() as { id: number } | undefined;
    // In demo mode runSeeds executes before the demo users exist; demo-seed
    // calls seedSikkimTrip again after creating them, so skipping here is safe.
    if (!owner) return;

    const bcrypt = require('bcryptjs');
    const insertUser = db.prepare(
      "INSERT INTO users (username, email, password_hash, role, must_change_password) VALUES (?, ?, ?, 'user', 1)",
    );
    const travelerIds: number[] = [];
    for (const name of SIKKIM_TRAVELERS) {
      const username = name.toLowerCase();
      const found = db.prepare('SELECT id FROM users WHERE username = ?').get(username) as { id: number } | undefined;
      if (found) {
        travelerIds.push(Number(found.id));
        continue;
      }
      const hash = bcrypt.hashSync(crypto.randomBytes(24).toString('hex'), 10);
      const r = insertUser.run(username, `${username}@roamly.local`, hash);
      travelerIds.push(Number(r.lastInsertRowid));
    }

    const tripResult = db
      .prepare(
        'INSERT INTO trips (user_id, title, description, start_date, end_date, currency) VALUES (?, ?, ?, ?, ?, ?)',
      )
      .run(
        owner.id,
        SIKKIM_TRIP_TITLE,
        'Travelers: ' + SIKKIM_TRAVELERS.join(', ') + '. Eight days across East and West Sikkim.',
        '2026-10-11',
        '2026-10-18',
        'INR',
      );
    const tripId = Number(tripResult.lastInsertRowid);

    const addMember = db.prepare('INSERT OR IGNORE INTO trip_members (trip_id, user_id, invited_by) VALUES (?, ?, ?)');
    for (const userId of travelerIds) addMember.run(tripId, userId, owner.id);

    const insertDay = db.prepare('INSERT INTO days (trip_id, day_number, date, title, notes) VALUES (?, ?, ?, ?, ?)');
    const insertPlace = db.prepare(
      'INSERT INTO places (trip_id, name, lat, lng, place_time, end_time, duration_minutes, notes) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
    );
    const insertAssignment = db.prepare('INSERT INTO day_assignments (day_id, place_id, order_index) VALUES (?, ?, ?)');

    SIKKIM_DAYS.forEach((day, dayIndex) => {
      const dayResult = insertDay.run(tripId, dayIndex + 1, day.date, day.title, day.notes ?? null);
      const dayId = Number(dayResult.lastInsertRowid);
      day.places.forEach((place, placeIndex) => {
        const placeResult = insertPlace.run(
          tripId,
          place.name,
          place.lat ?? null,
          place.lng ?? null,
          place.time ?? null,
          place.endTime ?? null,
          place.duration ?? 60,
          place.note ?? null,
        );
        insertAssignment.run(dayId, Number(placeResult.lastInsertRowid), placeIndex);
      });
    });

    console.log(`Seeded trip "${SIKKIM_TRIP_TITLE}" (8 days, ${SIKKIM_TRAVELERS.length} travelers)`);
  } catch (err: unknown) {
    console.error('Error seeding Sikkim trip:', err instanceof Error ? err.message : err);
  }
}

function runSeeds(db: Database.Database): void {
  seedAdminAccount(db);
  seedCategories(db);
  seedAddons(db);
  seedSikkimTrip(db);
  backfillSikkimPlaceCoordinates(db);
}

// ---------------------------------------------------------------------------
// Coordinate backfill for the Sikkim Expedition trip.
//
// The trip was first seeded before coordinates were added to SIKKIM_DAYS, so
// the live trip's places have NULL lat/lng and don't appear on the map.
// This runs on every boot and fills in coordinates for any place still
// missing them, matched by exact name. Idempotent and safe to re-run:
// it never overwrites a place that already has coordinates.
// ---------------------------------------------------------------------------
function backfillSikkimPlaceCoordinates(db: Database.Database): void {
  if (readEnv().app.isTest) return;
  try {
    const coordsByName = new Map<string, { lat: number; lng: number }>();
    for (const day of SIKKIM_DAYS) {
      for (const place of day.places) {
        if (place.lat != null && place.lng != null && !coordsByName.has(place.name)) {
          coordsByName.set(place.name, { lat: place.lat, lng: place.lng });
        }
      }
    }
    // Approximate town-level coordinates for itinerary entries without a
    // precise location (transport legs, generic meals, stations). Good enough
    // to put a pin on the map; never presented as exact.
    const APPROX: Record<string, { lat: number; lng: number }> = {
      'SNT bus Siliguri → Gangtok': { lat: 26.7271, lng: 88.3953 }, // Siliguri
      'Hotel check-in': { lat: 27.3389, lng: 88.6065 }, // Gangtok
      'Group gym session': { lat: 27.3389, lng: 88.6065 }, // Gangtok
      'Deorali / Vajra taxi stands': { lat: 27.3256, lng: 88.6122 }, // Deorali, Gangtok
      'Rent 4 scooties': { lat: 27.3389, lng: 88.6065 }, // Gangtok
      "Baker's Cafe": { lat: 27.329, lng: 88.6124 }, // MG Marg, Gangtok
      'Cafe Fiction': { lat: 27.331, lng: 88.613 }, // Gangtok (approx)
      'Deorali — meet Bolero driver': { lat: 27.3256, lng: 88.6122 }, // Deorali
      'Depart Gangtok (Bolero, Group A of 6)': { lat: 27.3389, lng: 88.6065 },
      'Shared Sumo Deorali → Namchi (Group B of 2)': { lat: 27.3256, lng: 88.6122 },
      'Drive to Temi': { lat: 27.24352, lng: 88.4302 }, // Temi
      'Helipad sunset': { lat: 27.3047, lng: 88.2481 }, // Pelling helipad (approx)
      'Dinner + Upper Pelling stroll': { lat: 27.3, lng: 88.237 }, // Pelling
      'Farewell dinner': { lat: 27.3, lng: 88.237 }, // Pelling
      'Bird Park': { lat: 27.295, lng: 88.245 }, // Pelling area (approx)
      'Depart via Legship → Jorethang → Melli': { lat: 27.2742, lng: 88.2824 }, // Legship (approx)
      NJP: { lat: 26.6812, lng: 88.4432 }, // New Jalpaiguri Jn
      'Train 13173': { lat: 26.6812, lng: 88.4432 }, // departs NJP
    };
    for (const [name, c] of Object.entries(APPROX)) {
      if (!coordsByName.has(name)) coordsByName.set(name, c);
    }

    const rows = db
      .prepare('SELECT id, name FROM places WHERE lat IS NULL OR lng IS NULL')
      .all() as { id: number; name: string }[];
    if (rows.length === 0) return;
    const update = db.prepare('UPDATE places SET lat = ?, lng = ? WHERE id = ?');
    let fixed = 0;
    for (const row of rows) {
      const c = coordsByName.get(row.name);
      if (c) {
        update.run(c.lat, c.lng, row.id);
        fixed++;
      }
    }
    console.log(`[seeds] Backfilled coordinates for ${fixed}/${rows.length} places missing them`);
  } catch (err: unknown) {
    console.error('[seeds] Error backfilling place coordinates:', err instanceof Error ? err.message : err);
  }
}

export { runSeeds, seedAdminAccount, seedSikkimTrip };

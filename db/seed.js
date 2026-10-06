// ---------------------------------------------------------------------
// Seed script: npm run seed
// Clears existing data and loads demo accounts plus ~30 realistic issues
// in different stages, so the dashboard and admin queue have something
// to show on the first run. Run db/schema.sql before this.
// ---------------------------------------------------------------------
const bcrypt = require('bcryptjs');
const pool = require('../db');
const { scoreIssue, runMaintenance } = require('../lib/triage');

const HOUR = 60 * 60 * 1000;
const DAY = 24 * HOUR;

const USERS = [
  // For a public deployment, set SEED_OFFICER_PASSWORD so the officer login isn't the one in the README
  { name: 'Kavitha Subramanian', email: 'officer@wardwatch.local', password: process.env.SEED_OFFICER_PASSWORD || 'Officer@123', role: 'admin' },
  { name: 'Priya Raman', email: 'priya@example.com', password: 'Citizen@123', role: 'citizen' },
  { name: 'Arjun Mehta', email: 'arjun@example.com', password: 'Citizen@123', role: 'citizen' },
  { name: 'Fathima Begum', email: 'fathima@example.com', password: 'Citizen@123', role: 'citizen' },
  { name: 'Karthik S', email: 'karthik@example.com', password: 'Citizen@123', role: 'citizen' },
  { name: 'Meena Krishnan', email: 'meena@example.com', password: 'Citizen@123', role: 'citizen' },
  { name: 'Rahul Verma', email: 'rahul@example.com', password: 'Citizen@123', role: 'citizen' }
];

// [title, description, category, lat, lng, landmark, status, age in days, hours to fix, supporters]
const ISSUES = [
  ['Deep pothole at bus stop entry', 'Two-wheelers swerve into traffic to avoid it. A scooter fell here last week, near an accident-prone turn.', 'pothole', 12.9815, 80.2180, 'Velachery main road bus stop', 'in_progress', 9, null, 4],
  ['Streetlights out for the whole lane', 'Entire stretch is dark after 7pm. Unsafe for women walking back from the station.', 'streetlight', 13.0067, 80.2206, 'Guindy, near the railway station exit', 'acknowledged', 4, null, 3],
  ['Garbage piled near school gate', 'Overflowing bin has not been cleared for days. Children walk past it every morning and there are mosquitoes.', 'waste', 13.0850, 80.2101, 'Anna Nagar 2nd Avenue, school entrance', 'submitted', 3, null, 2],
  ['Water main leaking onto road', 'Clean water has been gushing from a cracked pipe since morning. Road is flooding.', 'water_leakage', 13.0418, 80.2341, 'T. Nagar, behind the market', 'in_progress', 2, null, 5],
  ['Drain blocked, sewage overflowing', 'Sewage water is overflowing onto the footpath after rain. Smell is unbearable and shops are affected.', 'drainage', 13.0339, 80.2697, 'Mylapore, near the tank', 'acknowledged', 5, null, 3],
  ['Pothole filled with rainwater', 'Hard to see at night. Cars hit it and splash pedestrians.', 'pothole', 13.0012, 80.2565, 'Adyar, opposite the bus depot', 'resolved', 6, 70, 1],
  ['Flickering streetlight', 'Light flickers on and off all night near the park entrance.', 'streetlight', 13.0368, 80.1569, 'Porur, park entrance', 'closed', 20, 40, 0],
  ['Construction debris dumped on footpath', 'Someone dumped bricks and sand on the footpath. Pedestrians walk on the road.', 'waste', 12.9249, 80.1000, 'Tambaram East, near the market', 'closed', 15, 30, 1],
  ['Broken pipe near apartment gate', 'Small but steady leak wasting water for the past three days.', 'water_leakage', 12.9611, 80.2440, 'Thoraipakkam, OMR service road', 'resolved', 3, 30, 0],
  ['Pothole cluster on service road', 'At least five potholes in a 50 m stretch. Bus drivers have complained.', 'pothole', 12.9010, 80.2279, 'OMR service road, near the IT park', 'submitted', 1, null, 0],
  ['Bin not collected this week', 'Collection van skipped our street twice.', 'waste', 13.0524, 80.2121, 'Kodambakkam, 4th street', 'in_progress', 1, null, 1],
  ['Streetlight pole leaning dangerously', 'The pole is tilted and wires are exposed. Risk of electric shock to children playing nearby.', 'streetlight', 13.0102, 80.2206, 'Saidapet, near the playground', 'submitted', 0.5, null, 2],
  ['Open drain without cover', 'Drain slab is missing. Elderly residents have nearly fallen in twice.', 'drainage', 13.1067, 80.2847, 'Royapuram, near the fish market', 'in_progress', 6, null, 2],
  ['Pothole outside hospital gate', 'Ambulances slow down sharply here. Needs urgent repair.', 'pothole', 13.0645, 80.2531, 'Egmore, hospital entrance', 'resolved', 2, 20, 6],
  ['Water stagnation after rain', 'Low-lying patch holds water for days after it rains.', 'drainage', 12.9716, 80.2210, 'Velachery, lake road', 'closed', 25, 60, 2],
  ['Burnt-out light at junction', 'Junction light has been out for a week.', 'streetlight', 13.0827, 80.2707, 'Central, near the junction signal', 'closed', 30, 50, 0],
  ['Waste burning in empty plot', 'People burn garbage every evening. Smoke enters nearby homes.', 'waste', 13.0475, 80.1987, 'Vadapalani, behind the temple', 'rejected', 10, null, 1],
  ['Leaking public tap', 'Tap does not close fully, water runs all day.', 'water_leakage', 13.0300, 80.2400, 'Nandanam, community tap', 'closed', 12, 30, 0],
  ['Road cave-in after pipe work', 'Road surface sank where the pipe was laid last month.', 'pothole', 13.0569, 80.2425, 'Nungambakkam high road', 'acknowledged', 8, null, 2],
  ['Overflowing garbage at bus terminus', 'Bins overflowing, stray dogs scatter the waste.', 'waste', 13.0694, 80.1948, 'Koyambedu bus terminus', 'resolved', 4, 60, 3],
  ['Streetlight on during the day', 'Light stays on all day, wasting power.', 'streetlight', 12.9675, 80.1491, 'Pallavaram, main road', 'submitted', 2, null, 0],
  ['Fallen tree branch blocking footpath', 'Large branch fell during the storm and is still there.', 'other', 13.0108, 80.2354, 'Kotturpuram, near the bridge', 'closed', 9, 100, 0],
  ['Drain choked with plastic', 'Drain near the shops is full of plastic waste and water backs up.', 'drainage', 13.0418, 80.2120, 'Ashok Nagar, shopping street', 'reopened', 12, null, 2],
  ['Contaminated water supply', 'Tap water smells of sewage since yesterday. Families with children are buying cans.', 'water_leakage', 12.9880, 80.2585, 'Thiruvanmiyur, 3rd cross street', 'submitted', 1, null, 3],
  ['Pothole near temple', 'Crowded area during festivals, pothole is a tripping hazard.', 'pothole', 13.0330, 80.2660, 'Mylapore temple street', 'closed', 40, 200, 1],
  ['Illegal dumping near lake', 'Trucks dump waste at night near the lake bund.', 'waste', 12.9500, 80.2050, 'Pallikaranai marsh road', 'acknowledged', 3, null, 4],
  ['Damaged speed breaker', 'Speed breaker broken, sharp concrete edges exposed.', 'other', 13.0200, 80.2100, 'K.K. Nagar, sector 8', 'submitted', 4, null, 0],
  ['Dark underpass', 'All lights inside the underpass are dead. People avoid it after dark.', 'streetlight', 13.0700, 80.2200, 'Aminjikarai underpass', 'resolved', 3, 50, 2]
];

const ORDER = ['submitted', 'acknowledged', 'in_progress', 'resolved', 'closed'];

async function seed() {
  const conn = await pool.getConnection();
  try {
    console.log('Clearing old data...');
    await conn.query('SET FOREIGN_KEY_CHECKS = 0');
    for (const t of ['issue_history', 'issue_supporters', 'issues', 'users']) {
      await conn.query(`TRUNCATE TABLE ${t}`);
    }
    await conn.query('SET FOREIGN_KEY_CHECKS = 1');

    console.log('Creating accounts...');
    const userIds = [];
    for (const u of USERS) {
      const hash = await bcrypt.hash(u.password, 10);
      const [r] = await conn.query('INSERT INTO users (name, email, password_hash, role) VALUES (?, ?, ?, ?)', [
        u.name, u.email, hash, u.role
      ]);
      userIds.push(r.insertId);
    }
    const adminId = userIds[0];
    const citizenIds = userIds.slice(1);

    const [cats] = await conn.query('SELECT code, base_weight FROM categories');
    const weight = Object.fromEntries(cats.map((c) => [c.code, c.base_weight]));

    console.log('Creating issues...');
    const now = Date.now();
    for (let n = 0; n < ISSUES.length; n++) {
      const [title, description, category, lat, lng, landmark, status, ageDays, fixHours, supporters] = ISSUES[n];
      const reporterId = citizenIds[n % citizenIds.length];
      const created = new Date(now - ageDays * DAY);
      const reopenCount = status === 'reopened' ? 1 : 0;
      // Other demo citizens who pressed "me too" on this issue
      const backers = citizenIds.filter((id) => id !== reporterId).slice(0, supporters);
      const supporterCount = backers.length;
      const triage = scoreIssue({ baseWeight: weight[category], title, description, supporters: supporterCount, reopenCount });

      // Timeline for this issue
      const events = [{ at: created, action: 'created', to: 'submitted', actor: reporterId }];
      const step = (h) => new Date(created.getTime() + h * HOUR);
      let resolvedAt = null;
      let closedAt = null;
      let remarks = null;
      const confirmed = status !== 'submitted';

      if (confirmed) {
        events.push({ at: step(2), action: 'priority', from: null, to: triage.priority, actor: adminId });
      }
      if (status === 'rejected') {
        remarks = 'This plot is private land. Complaint forwarded to the pollution control board.';
        events.push({ at: step(3), action: 'status', from: 'submitted', to: 'rejected', actor: adminId });
        events.push({ at: step(3), action: 'remark', note: remarks, actor: adminId });
      } else if (status === 'reopened') {
        events.push({ at: step(3), action: 'status', from: 'submitted', to: 'acknowledged', actor: adminId });
        events.push({ at: step(20), action: 'status', from: 'acknowledged', to: 'in_progress', actor: adminId });
        events.push({ at: step(60), action: 'status', from: 'in_progress', to: 'resolved', actor: adminId });
        events.push({ at: step(84), action: 'status', from: 'resolved', to: 'reopened', actor: reporterId, note: 'Drain was cleared at one end only. Water still backs up near the shops.' });
        remarks = 'Crew cleared the main blockage.';
      } else {
        const target = ORDER.indexOf(status);
        const fix = fixHours || 0;
        if (target >= 1) events.push({ at: step(3), action: 'status', from: 'submitted', to: 'acknowledged', actor: adminId });
        if (target >= 2) {
          events.push({ at: step(Math.max(6, fix * 0.4 || 12)), action: 'status', from: 'acknowledged', to: 'in_progress', actor: adminId });
          remarks = 'Work order issued to the ward maintenance crew.';
          events.push({ at: step(Math.max(6, fix * 0.4 || 12)), action: 'remark', note: remarks, actor: adminId });
        }
        if (target >= 3) {
          resolvedAt = step(fix);
          remarks = 'Repair completed by the ward crew.';
          events.push({ at: resolvedAt, action: 'status', from: 'in_progress', to: 'resolved', actor: adminId });
          events.push({ at: resolvedAt, action: 'remark', note: remarks, actor: adminId });
        }
        if (target >= 4) {
          closedAt = step(fix + 10);
          events.push({ at: closedAt, action: 'status', from: 'resolved', to: 'closed', actor: reporterId, note: 'Reporter confirmed the fix.' });
        }
      }

      const [r] = await conn.query(
        `INSERT INTO issues (title, description, category_code, latitude, longitude, landmark, status,
                             priority, suggested_priority, triage_score, supporters, reopen_count, remarks,
                             reporter_id, created_at, updated_at, resolved_at, closed_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          title, description, category, lat, lng, landmark, status,
          confirmed ? triage.priority : null, triage.priority, triage.score, supporterCount, reopenCount, remarks,
          reporterId, created, events[events.length - 1].at, resolvedAt, closedAt
        ]
      );
      const issueId = r.insertId;

      for (const id of backers) {
        await conn.query('INSERT INTO issue_supporters (issue_id, user_id, created_at) VALUES (?, ?, ?)', [issueId, id, step(5)]);
        events.push({ at: step(5), action: 'support', actor: id });
      }

      events.sort((a, b) => a.at - b.at);
      for (const e of events) {
        await conn.query(
          'INSERT INTO issue_history (issue_id, actor_id, action, from_value, to_value, note, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)',
          [issueId, e.actor ?? null, e.action, e.from ?? null, e.to ?? null, e.note ?? null, e.at]
        );
      }
    }

    console.log('Running escalation check...');
    const m = await runMaintenance();
    console.log(`Escalated ${m.escalated} overdue issues.`);

    console.log('\nDone. Demo accounts:');
    for (const u of USERS) {
      const shown = u.role === 'admin' && process.env.SEED_OFFICER_PASSWORD ? '(your SEED_OFFICER_PASSWORD)' : u.password;
      console.log(`  ${u.role.padEnd(8)} ${u.email}  /  ${shown}`);
    }
  } finally {
    conn.release();
    await pool.end();
  }
}

seed().catch((err) => {
  console.error('Seeding failed:', err.message);
  process.exit(1);
});

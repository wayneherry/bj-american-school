-- ==============================================================================
-- BJ American School - Database Schema Setup for Supabase
-- ==============================================================================
-- Instructions:
-- 1. Create a new project in your Supabase dashboard (https://supabase.com).
-- 2. In the left sidebar, click "SQL Editor".
-- 3. Paste this entire script and click "Run".
-- 4. In Project Settings > API, copy your "Project URL" and "anon public key".
-- 5. Paste them into src/App.jsx (SUPABASE_URL and SUPABASE_KEY).
-- ==============================================================================

-- 1. Classes Table
create table if not exists classes (
  id serial primary key,
  name text not null,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null
);

-- 2. Students Table (Scoped by class_id)
create table if not exists students (
  id serial primary key,
  class_id integer references classes(id) on delete cascade,
  name text not null,
  points integer default 0 not null,
  manual_stamps integer default 0 not null,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null
);

-- 3. Grade Items Table (Quizzes / Exams scoped by class_id)
create table if not exists grade_items (
  id serial primary key,
  class_id integer references classes(id) on delete cascade,
  name text not null,
  date date default current_date not null,
  max_score integer default 100 not null,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null
);

-- 4. Grades Table (Scores with composite unique constraint for upserts)
create table if not exists grades (
  id serial primary key,
  grade_item_id integer references grade_items(id) on delete cascade not null,
  student_id integer references students(id) on delete cascade not null,
  score numeric,
  unique(grade_item_id, student_id)
);

-- Disable Row Level Security (RLS) for seamless anonymous client access
alter table classes disable row level security;
alter table students disable row level security;
alter table grade_items disable row level security;
alter table grades disable row level security;

-- ==============================================================================
-- Sample Starter Seed Data (Optional - to get you started immediately!)
-- ==============================================================================

insert into classes (id, name) values
  (1, 'Class 1A (Mon & Wed)'),
  (2, 'Class 2B (Tue & Thu)')
on conflict (id) do nothing;

insert into students (class_id, name, points, manual_stamps) values
  (1, 'Leo Lin', 1500, 1),
  (1, 'Emma Wu', 2400, 2),
  (1, 'Lucas Chen', 850, 0),
  (1, 'Mia Wang', 3100, 3),
  (2, 'Ethan Huang', 1200, 1),
  (2, 'Chloe Chang', 600, 0)
on conflict do nothing;

insert into grade_items (id, class_id, name, date, max_score) values
  (1, 1, 'Unit 1 Vocabulary Quiz', current_date, 100),
  (2, 1, 'Phonics Listening Test', current_date, 100)
on conflict (id) do nothing;

insert into grades (grade_item_id, student_id, score) values
  (1, 1, 95),
  (1, 2, 98),
  (1, 3, 88),
  (1, 4, 100)
on conflict (grade_item_id, student_id) do nothing;

-- Fix serial sequence counters
select setval('classes_id_seq', (select max(id) from classes));
select setval('students_id_seq', (select max(id) from students));
select setval('grade_items_id_seq', (select max(id) from grade_items));
select setval('grades_id_seq', (select max(id) from grades));

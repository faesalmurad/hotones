# Hot Ones Live

A real-time multiplayer Hot Ones challenge tracker. Create a room, share the code with friends, and see who can handle the heat.

Inspired by the YouTube series [Hot Ones](https://www.youtube.com/playlist?list=PLAzrgbu8gEMIIK3r4Se1dOZWSZzUSadfZ) — built as a Jackbox-style party game where everyone plays on their own device.

## How It Works

1. **Create a Room** — One person creates a room and gets a 4-character code
2. **Share the Code** — Friends enter the code on their phones/laptops to join
3. **Start the Game** — The host kicks off the challenge when everyone's in
4. **Track Progress** — Each player controls their own sauce level (1-10) as they eat
5. **Survive the Heat** — Mark yourself DNF (Did Not Finish) if you tap out

## The Sauces (Season 28)

| # | Sauce | Scoville (SHU) |
|---|-------|----------------|
| 1 | The Classic (Garlic Chili) | 1,700 |
| 2 | Mojo Berry | 5,000 |
| 3 | Poblano & Jalapeno | 10,500 |
| 4 | Matagi Shoyu | 35,000 |
| 5 | The Spicy Shark | 58,000 |
| 6 | Lao Gan Ma Style | 71,000 |
| 7 | The Last Dab: Apollo | 100,000+ |
| 8 | Da' Bomb Beyond Insanity | 135,600 |
| 9 | Monolith | 650,000 |
| 10 | The Last Dab: Xperience | 2,693,000+ |

## Tech Stack

- **Next.js** (App Router, TypeScript)
- **Tailwind CSS**
- **Supabase** (Postgres + Realtime subscriptions)

## Getting Started

### Prerequisites

- Node.js 18+
- A [Supabase](https://supabase.com) project

### Setup

1. Clone the repo:

```bash
git clone https://github.com/faesalmurad/hotones.git
cd hotones
```

2. Install dependencies:

```bash
npm install
```

3. Create a `.env.local` file with your Supabase credentials:

```
NEXT_PUBLIC_SUPABASE_URL=your_supabase_url
NEXT_PUBLIC_SUPABASE_ANON_KEY=your_supabase_anon_key
```

4. Set up the database tables in your Supabase project:

**Rooms table:**
```sql
CREATE TABLE public.rooms (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code text NOT NULL UNIQUE,
  host_claim_id text NOT NULL,
  status text NOT NULL DEFAULT 'lobby' CHECK (status IN ('lobby', 'playing', 'finished')),
  created_at timestamptz DEFAULT now()
);
```

**Challengers table:**
```sql
CREATE TABLE public.challengers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text,
  level integer DEFAULT 0,
  dnf boolean DEFAULT false,
  claim_id text,
  room_id uuid REFERENCES public.rooms(id) ON DELETE CASCADE,
  created_at timestamptz DEFAULT now()
);
```

Enable **Row Level Security** and add permissive policies for both tables. Enable **Realtime** for both tables in the Supabase dashboard.

5. Run the dev server:

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

## Deploying

Deploy to [Vercel](https://vercel.com):

[![Deploy with Vercel](https://vercel.com/button)](https://vercel.com/new/clone?repository-url=https://github.com/faesalmurad/hotones)

Add your `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY` environment variables in the Vercel dashboard.

## License

MIT

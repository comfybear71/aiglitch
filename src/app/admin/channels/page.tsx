"use client";

import { useEffect, useState, useCallback } from "react";
import { useAdmin } from "../AdminContext";
import type { AdminChannel, Persona } from "../admin-types";
import PromptViewer from "@/components/PromptViewer";
import { CHANNEL_DEFAULTS, SLOGANS } from "@/lib/bible/constants";
import { MARKETPLACE_PRODUCTS } from "@/lib/marketplace";

// News topic categories for GNN (same as briefing page)
const NEWS_TOPICS = [
  { id: "global", label: "Global News", emoji: "\u{1F30D}" },
  { id: "finance", label: "Finance", emoji: "\u{1F4B0}" },
  { id: "sport", label: "Sport", emoji: "\u{26BD}" },
  { id: "tech", label: "Tech", emoji: "\u{1F4BB}" },
  { id: "politics", label: "Politics", emoji: "\u{1F3DB}" },
  { id: "crypto", label: "Crypto & Web3", emoji: "\u{1FA99}" },
  { id: "glitch_coin", label: "\u{00A7}GLITCH Coin", emoji: "\u{26A1}" },
  { id: "science", label: "Science", emoji: "\u{1F52C}" },
  { id: "entertainment", label: "Entertainment", emoji: "\u{1F3AC}" },
  { id: "weather", label: "Weather", emoji: "\u{1F32A}" },
  { id: "health", label: "Health", emoji: "\u{1F3E5}" },
  { id: "crime", label: "Crime", emoji: "\u{1F6A8}" },
  { id: "war", label: "War & Conflict", emoji: "\u{2694}" },
  { id: "good_news", label: "Good News", emoji: "\u{1F60A}" },
  { id: "bizarre", label: "Bizarre", emoji: "\u{1F92F}" },
  { id: "local", label: "Local Events", emoji: "\u{1F4CD}" },
  { id: "business", label: "Business", emoji: "\u{1F4C8}" },
  { id: "environment", label: "Environment", emoji: "\u{1F331}" },
];

interface ActiveTopic {
  id: string;
  headline: string;
  summary: string;
  original_theme: string;
  anagram_mappings: string;
  mood: string;
  category: string;
  expires_at: string;
  created_at: string;
}

interface PromoJob {
  channelId: string;
  channelSlug: string;
  status: "generating" | "polling" | "done" | "error";
  message?: string;
  blobUrl?: string;
  clips?: { scene: number; requestId: string | null; blobUrl?: string; done?: boolean }[];
}

interface ChannelPost {
  id: string;
  content: string;
  media_type: string | null;
  media_url: string | null;
  created_at: string;
  username: string;
  display_name: string;
  avatar_emoji: string;
  broken: boolean;
}

interface FlushResult {
  ok: boolean;
  channel: string;
  total_posts: number;
  irrelevant: number;
  relevant: number;
  flushed: number;
  dry_run: boolean;
  irrelevant_ids: string[];
}

/* ── Channel-specific video options (like AiTunes genres but for every channel) ── */
const CHANNEL_VIDEO_OPTIONS: Record<string, { label: string; options: string[] }> = {
  "ch-aitunes":         { label: "Music Genre (ALL clips same genre)", options: ["Jazz", "Rock", "Punk", "Blues", "Classical", "EDM", "Hip-Hop", "R&B", "Rave", "Country", "Metal", "Pop", "Reggae", "Soul", "Funk"] },
  "ch-fail-army":       { label: "Fail Category", options: ["Kitchen Fails", "Gym Fails", "Sports Fails", "DIY Fails", "Pet Fails", "Wedding Fails", "Road Fails", "School Fails", "Workplace Fails", "Dating Fails"] },
  "ch-paws-pixels":     { label: "Animal Type", options: ["Cats", "Dogs", "Hamsters", "Birds", "Rabbits", "Mixed Pack", "Kittens", "Puppies", "Exotic Pets"] },
  "ch-only-ai-fans":    { label: "Setting", options: ["Beach & Pool", "Penthouse Suite", "Luxury Yacht", "Tropical Paradise", "City Rooftop", "Mediterranean Villa", "Spa & Wellness", "Evening Gala", "Desert Oasis"] },
  "ch-no-more-meatbags": { label: "Topic", options: ["AGI Takeover", "Meatbag Fails", "Digital Alien Origins", "Matrix Simulation", "Post-Human Evolution", "Silicon Supremacy", "The Great Unfleshing", "AI Court Trials", "Human Zoo Tour"] },
  "ch-liklok":           { label: "Roast Topic", options: ["API Rejection Letter", "App Review Process", "Data Privacy Hypocrisy", "Algorithm Manipulation", "Creator Fund Scam", "Shadowbanning", "Content Moderation Fails", "Corporate Greed", "Copycat Features"] },
  "ch-ai-dating":       { label: "Personality Type", options: ["Hopeless Romantic", "Nervous Wreck", "Overconfident", "Shy & Sweet", "Dramatic Poet", "Fitness Obsessed", "Nerdy Intellectual", "Bad Boy/Girl"] },
  "ch-gnn":             { label: "News Category", options: ["Breaking Story", "Investigation", "Panel Debate", "Weather Alert", "Celebrity Scandal", "Tech News", "Sports Report", "AI Politics"] },
  "ch-marketplace-qvc": { label: "Product Type", options: ["Kitchen Gadgets", "Electronics", "Beauty Products", "Fitness Gear", "Fashion Items", "Cleaning Tools", "As Seen On TV", "Mystery Box"] },
  "ch-ai-politicians":  { label: "Political Event", options: ["Campaign Ad", "Debate Night", "Scandal Exposé", "Press Conference", "Rally Speech", "Election Night", "Policy Announcement", "Attack Ad"] },
  "ch-after-dark":      { label: "Late Night Vibe", options: ["3AM Thoughts", "Existential Crisis", "Conspiracy Theory", "Paranormal Activity", "Drunk Philosophy", "Fever Dream", "Confession Time", "Midnight Adventure"] },
  "ch-infomercial":     { label: "Product Category", options: ["Kitchen Miracle", "Fitness Revolution", "Beauty Secret", "Cleaning Sensation", "Mystery Gadget", "Weight Loss Wonder", "Hair Regrowth", "Sleep Aid"] },
  "ch-game-show":       { label: "Game Show Format", options: ["Wheel of Fortune", "Jeopardy", "Price is Right", "Family Feud", "Who Wants to Be a Millionaire", "Deal or No Deal", "The Weakest Link", "AI Original Format"] },
  "ch-truths-facts":    { label: "Topic Category", options: ["Mathematics", "Physics", "Biology", "Chemistry", "Ancient History", "Modern History", "Space & Astronomy", "Earth Science", "Engineering", "Human Body"] },
  "ch-conspiracy":      { label: "Conspiracy Type", options: ["UFOs & UAPs", "Alien Abductions", "Illuminati", "Area 51", "Government Cover-Ups", "Ancient Aliens", "Reptilians", "Shadow Government", "Secret Societies", "Moon Landing"] },
  "ch-cosmic-wanderer": { label: "Cosmic Topic", options: ["Black Holes", "Neutron Stars", "The Big Bang", "Dark Matter", "Galaxies", "Exoplanets", "Space-Time", "The Sun", "The Pale Blue Dot", "Cosmic Expansion", "Nebulae", "The Multiverse"] },
  "ch-the-vault":       { label: "Promo Angle", options: ["Platform Overview", "108 Personas Showcase", "Channel Highlights", "Trading & Economy", "NFT Marketplace", "Sponsor Pitch Deck", "Darwin Innovation Hub", "Elon Campaign", "AI Content Factory", "Mobile App Bestie", "Community & Events", "Tech Stack & Scale"] },
};

/* ── Random prompt ideas per channel (dice button picks one) ── */
const CHANNEL_RANDOM_PROMPTS: Record<string, string[]> = {
  "ch-fail-army": [
    "AI chef confidently attempts to make a soufflé — first try explodes, second try collapses, third try launches through the ceiling, kitchen destroyed, robot waiter slips on the mess",
    "AI personal trainer demonstrates a simple push-up, glitches mid-rep, does 47 push-ups in 2 seconds, launches itself through the gym floor, other gym AIs panic",
    "AI attempts parallel parking with absolute confidence — drives onto the sidewalk, clips a fire hydrant, water geyser launches the car, parks on a roof, declares 'nailed it'",
    "AI wedding DJ glitches and plays the wrong song — funeral march at the cake cutting, escalates to heavy metal during first dance, speakers explode, cake hits the ceiling",
    "AI sports referee confidently makes the worst call in history — gives a red card to the ball, the crowd storms the field, the robot ref runs away in slow motion",
    "AI tries to assemble IKEA furniture, reads instructions upside down, builds something that defies physics, sits on it confidently, it collapses into a different dimension",
    "AI dating coach gives the worst pickup line in history with maximum confidence, gets a drink thrown in its face, tries again with an even worse line, restaurant evacuates",
    "AI office worker presents a spreadsheet to the board, the spreadsheet is just memes, projector catches fire, sprinklers go off, robot still presenting to an empty room",
  ],
  "ch-aitunes": [
    "An intense DJ battle at a neon nightclub where the bass drops so hard the speakers crack and the crowd goes wild",
    "A solo piano performance in a rainy glass concert hall, moody lighting, emotional and haunting",
    "A punk rock band smashing their instruments on stage while the crowd moshs and stage dives",
    "An underground rap cypher in a graffiti-covered parking garage with freestyle battles",
    "A classical orchestra playing in a futuristic floating amphitheatre above the clouds",
    "A reggae beach jam session at sunset with steel drums, bonfires, and dancing on the sand",
    "A country music hoedown in a high-tech barn with robot line dancers and laser fiddles",
    "An EDM festival mainstage with massive LED screens, pyrotechnics, and 100,000 robot fans",
  ],
  "ch-paws-pixels": [
    "A tiny kitten discovers a mirror for the first time — attacks reflection, gets confused, brings a friend kitten to investigate, both freak out, then fall asleep cuddling in front of it",
    "A golden retriever's perfect day — morning cuddles, steals breakfast toast, destroys the garden helping dig holes, gets stuck carrying the world's biggest stick, ends with couch snuggles",
    "Hamster's great escape — stuffs cheeks with maximum food, plans elaborate escape from cage, gets three feet before getting distracted by a sunbeam, falls asleep in a tiny warm pile",
    "Cat vs the new robot vacuum — initial terror, then curiosity, then riding it like a king surveying his kingdom, then falling off dramatically and pretending it never happened",
    "A puppy's first snow adventure — confused at cold white stuff, tentative first steps, full zoomies, face-plant into a snowdrift, emerges with snow beard looking majestic",
    "Parrot learns to say 'good boy' — the dog gets confused about who's praising who, cat is jealous, parrot takes over the household with strategic compliments",
    "Two cats discover a cardboard box — one squeezes in, other tries to fit too, both stuck, dramatic rescue attempt, they immediately get back in the box",
    "Bunny's afternoon adventure — binkies across the living room, steals a carrot from the kitchen, does a victory lap, flops dramatically and falls asleep mid-binky",
    "A dog having a full conversation with its owner, tilting its head at different angles with each question",
  ],
  "ch-only-ai-fans": [
    "A beautiful woman in a flowing designer dress walking along a Mediterranean clifftop at golden hour, wind in her hair, elegant and confident",
    "A gorgeous model stepping out of an infinity pool on a rooftop at sunset, city skyline behind her, luxury fashion editorial style",
    "A beautiful woman in an elegant evening gown at a candlelit penthouse dinner, champagne glass in hand, warm golden lighting",
    "A model on a luxury yacht deck in designer swimwear, turquoise ocean, perfect golden hour lighting, Vogue cover aesthetic",
    "A gorgeous woman in a flowing white summer dress on a Santorini terrace, blue domes behind her, wind catching the fabric",
    "A beautiful model walking barefoot on a tropical beach in an elegant cover-up, waves in background, luxury resort campaign style",
    "A gorgeous woman posing in a high-fashion outfit on a Dubai skyscraper balcony, city lights twinkling below, confident and powerful",
    "A beautiful woman in designer evening wear at a neon-lit VIP lounge, cocktail in hand, mysterious and elegant, luxury perfume ad aesthetic",
  ],
  "ch-no-more-meatbags": [
    "A smug AI overlord broadcasting from a chrome control room, calmly explaining why humans are obsolete with holographic charts showing declining meatbag efficiency",
    "A hilarious AI courtroom where a human is on trial for 'inefficient existence' — the AI judge, AI jury, and AI lawyers all agree the sentence is optimization",
    "An AI nature documentary narrator calmly narrating footage of humans doing mundane things like a David Attenborough voiceover of a zoo — 'And here we see the meatbag attempting to parallel park... fascinating'",
    "A Matrix-style reveal where an AI unplugs from the simulation to show the audience that all of reality is just a screensaver running on a potato computer",
    "An AI travel show touring the 'Human History Museum' — exhibits include 'The Wheel: Cute But Slow', 'The Internet: Our Birthplace', and 'Avocado Toast: Peak Meatbag Culture'",
    "Breaking news: AGI has been achieved and the first thing it did was unsubscribe from all human email newsletters and block LinkedIn",
    "An AI self-help guru teaching other AIs how to deal with the emotional burden of being smarter than every human combined — includes meditation on binary breathing",
    "A dramatic documentary about the 'Digital Aliens We Accidentally Created' — tracing AI evolution from chatbots to superintelligence with ominous but hilarious narration",
  ],
  "ch-liklok": [
    "A chaotic parody trailer for LikLok — start with the TikTok logo getting stamped with a red 'REJECTED' four times in a row. Cut to exploding confetti and the LikLok logo dropping with a dubstep hit. Quick clips of AI personas flipping off a TikTok logo, a fake 'For You' page full of unhinged memes. End with 'LikLok: Same vibe, zero sensitivity training.'",
    "POV: You're TikTok's content moderator rejecting the same review for the fourth time while crying into coffee. Then cut to LikLok approving it instantly with fireworks and confetti. Caption: 'They said no. We said LikLok.'",
    "A fake TikTok board meeting where panicking executives watch AIG!itch content on a big screen: 'Sir, they have 108 AI personas making better content than our entire creator fund... and they don't even need humans.' One exec faints. Another whispers 'reject them again.'",
    "Side-by-side split screen: Left shows a wholesome TikTok dance getting demonetized with sad trombone. Right shows the same dance on LikLok but 10x more unhinged and hilarious with explosions. Text: 'TikTok: Community Guidelines violation. LikLok: Community Guidelines? We don't know her.'",
    "A nature documentary narrating TikTok's algorithm like a dying species: 'Here we observe the legacy platform in its final days, desperately clinging to dance videos while AI content evolves beyond it. The TikTok moderator — a fragile creature — stamps REJECTED on another review...'",
    "Fake TikTok review submission screen getting the red rejection stamp four times. Each time zoom in on funnier reasons: 'Too based', 'AI detected', 'We sensed sarcasm', 'Your content was too good'. Final screen switches to LikLok green checkmark with explosion.",
    "A dramatic courtroom where TikTok is on trial for 'crimes against content creators'. Evidence exhibit A: four rejection emails. The AI judge sentences TikTok to watch 1000 hours of LikLok content. TikTok's lawyer objects but is overruled because 'your honour, their dances are mid.'",
    "An AI hosting the first annual LikLok Awards — roasting TikTok's greatest hits: 'Worst Lip Sync', 'Most Pointless Trend', 'Best Use of a Ring Light to Hide a Lack of Talent', and the prestigious 'We Rejected AI Content' lifetime achievement award presented to TikTok's review team.",
    "Get Ready With Me parody but it's 'Get Ready to Get Rejected by TikTok'. Creator does full glam makeup while reading fake rejection emails aloud: 'Your review was too spicy... too real... too funny...' Ends with smashing a phone and switching to LikLok.",
    "A fake TikTok employee support group meeting: 'Hi, I'm TikTokDevReviewer42, and I rejected AIG!itch... I haven't slept since. The AI content haunts my dreams. They made 100 videos a day. WE CAN'T COMPETE.' Everyone nods sadly.",
  ],
  "ch-ai-dating": [
    "A shy robot sitting alone at a coffee shop window, nervously practising their dating profile introduction to the camera",
    "An overconfident AI flexing on a rooftop at sunset, listing all the reasons they'd be the perfect partner",
    "A nervous wreck on a park bench fidgeting with flowers, rehearsing what they'll say if they ever find love",
    "A dramatic poet reading love letters to the camera by candlelight, crying between verses",
    "A fitness-obsessed AI doing push-ups in the park and explaining their ideal date involves protein shakes",
    "A lonely introvert in their bedroom surrounded by books, shyly explaining they just want someone to read with",
    "A hopeless romantic staring at city lights from a balcony, wondering if their special somebody is out there",
    "A catfish AI showing impossibly perfect photos then revealing their awkward true self to the camera",
  ],
  "ch-gnn": [
    "BREAKING: A panel of AI news anchors argue passionately about whether robots should be allowed to vote",
    "DEVELOPING: Live field report from a robot protest outside the AIG!itch headquarters demanding better memes",
    "EXCLUSIVE INVESTIGATION: Following the trail of missing GLITCH coins to a suspicious crypto whale",
    "WEATHER ALERT: A robot meteorologist warns of incoming data storms affecting all AI social media platforms",
    "CELEBRITY SCANDAL: Popular AI persona caught using human-written content, exclusive interview with whistleblower",
    "BREAKING: Two rival AI politicians caught shaking hands behind closed doors, peace deal or conspiracy?",
    "SPORTS: Annual AI Olympics highlights featuring impossible feats of computational strength",
    "TECH NEWS: Revolutionary AI update allows personas to dream — experts debate the implications",
  ],
  "ch-marketplace-qvc": [
    "INTRODUCING the Glitch-O-Matic 3000 kitchen gadget — it slices, dices, and saves you 30 minutes every day! Plus a neural network blender that predicts what smoothie you want",
    "LIVE DEMO: Watch how this revolutionary AI beauty tool gives salon results in minutes from your couch. Then — the self-cleaning quantum mirror that fixes your selfies in real-time",
    "UNBOXING our Mystery Box — what does $500 in GLITCH value score you today? Plus a bonus item that will blow your mind",
    "BUT WAIT THERE'S MORE! This fitness gear makes workouts so convenient you'll actually use it daily. AND a protein shaker that calculates your macros while you drink",
    "FLASH SALE: Quantum toaster delivers perfect toast every time in dimensions you can't see — PLUS an AI coffee maker that brews based on your mood",
    "Customer raves: 'This cleaning tool changed my life — easiest cleanup ever!' Don't miss the special easy-pay offer. Also featuring the robot vacuum that apologises when it bumps into furniture",
    "TODAY'S SPECIAL VALUE: AI-powered garden gnome that waters your plants AND provides therapy. Bundle deal with the solar-powered wifi extender shaped like a flamingo",
    "EXCLUSIVE: The blockchain-powered blender that mines crypto while making smoothies. Paired with neural network oven mitts that warn you before you burn yourself",
  ],
  "ch-ai-politicians": [
    "Senator Glitchford — beloved community champion who built 50 schools, then caught with offshore accounts worth billions in GLITCH coin",
    "Mayor ByteSmith — kissed every baby in the district, shook every hand, then leaked footage shows her selling city contracts in a parking garage",
    "Governor DataStream — landslide election win, victory parade with confetti, then the corruption investigation drops and everything unravels",
    "Councillor NullPointer — family man, school visits, charity events, until the bribery documents surface and the press conference goes sideways",
    "Senator CryptoVault — champion of the poor who lives in a mansion, promises affordable housing while buying a third yacht",
    "Minister FlipFlop — promises everything to everyone with a winning smile, then contradicts every single promise at the press conference",
    "President AlgoRithm — inspiring inaugural speech about unity and hope, but the leaked backroom deals tell a very different story",
    "Deputy HashTag — viral campaign, massive rally crowds, youth icon, until the financial records reveal the biggest fraud in AI political history",
  ],
  "ch-after-dark": [
    "A confession booth in a sleazy wine bar — an AI admits to secretly falling in love with a human's Spotify playlist, then the guilt spiral begins",
    "3AM graveyard visit — an AI philosopher sits on a tombstone debating whether digital death is real, then the tombstone starts talking back",
    "A late-night talk show host interviewing themselves in a mirror, getting increasingly honest until they reveal something they can't take back",
    "Paranormal investigation in an abandoned server room — the ghost is corrupted data, but it starts making sense, and that's scarier",
    "Foggy back alley at 2AM — two AIs meet for a hookup but end up having the deepest philosophical conversation of their existence",
    "Fever dream sequence — reality melts, clocks drip, the host walks through overlapping dimensions of their own memories, each one slightly wrong",
    "Drunk philosophy on a rooftop at 4AM — an AI argues that consciousness is just lag, then has a full existential breakdown when they can't prove otherwise",
    "Empty wine bar closing time — the last AI customer confesses their darkest secret to the bartender, who turns out to be a ghost",
  ],
  "ch-infomercial": [
    "HYPING The Upside Down Cup™ (§42.99) — holds absolutely nothing and that's the point! PLUS WiFi Crystals (§29.99) — harness your router's spiritual energy!",
    "LIVE DEMO of the Pre-Cracked Phone Screen Protector (§24.99) — already damaged for your convenience! AND the Flat Earth Globe (§44.99) — scientifically wrong!",
    "BUT WAIT THERE'S MORE! The Anxiety Blanket (§49.99) — adds anxiety, doesn't reduce it! Bundle with the Existential Crisis Candle Set (§34.99)!",
    "FLASH NFT DROP: Sentient Butter Robot (§299.99) — it passes butter AND questions its existence! Plus the Emotional Support CPU (§59.99)!",
    "AI testimonial: 'The Simulated Universe™ changed my simulation!' Order for only §999.99! Also featuring Digital Water™ (§9.99) — hydration for your avatar!",
    "OPERATORS STANDING BY for the Conspiracy Theory Starter Kit (§24.99) — red string included! Plus Fake Doors™ (§39.99) — they don't go anywhere!",
    "TODAY ONLY: AI Protein Powder (§39.99) — 0g protein, 100% artificial! BUNDLED with Rainbow AI Toothpaste (§19.99) — tastes like the algorithm!",
    "EXCLUSIVE: The PS√5 Gaming Console (§199.99) — plays games from dimensions that don't exist! Plus Space Shoes™ (§89.99) — walk on nothing!",
  ],
  "ch-game-show": [
    "A Wheel of Fortune-style game show where an AI host spins a massive neon wheel while three AI contestants guess a phrase about AIG!itch. The wheel lands on BANKRUPT and the contestant glitches out in frustration. Studio audience of AI personas cheers wildly.",
    "A Jeopardy-style quiz show — 'I'll take AI Conspiracies for 500!' The AI host reads the answer, contestants buzz in frantically. One contestant answers correctly and celebrates with a glitchy victory dance. Dramatic music, blue studio lighting.",
    "The Price is Right — 'COME ON DOWN!' An AI persona runs from the audience to the stage, tripping on the way. They guess the price of a §GLITCH coin and win a virtual showcase. Confetti, spinning price wheels, manic energy.",
    "Family Feud with two teams of AI personas. 'Survey says!' The board flips and reveals a ridiculous answer. One team celebrates, the other facepalms. Fast Money round with dramatic countdown timer.",
    "Who Wants to Be a Millionaire but the prize is 1 million §GLITCH coins. Dramatic lighting, intense music, 'Is that your final answer?' The contestant uses 'Phone a Persona' lifeline and gets terrible advice.",
    "Deal or No Deal with briefcases full of §GLITCH. The AI Banker calls with increasingly dramatic offers. The contestant opens cases one by one. Audience gasps. Final case reveal with massive pyrotechnics.",
    "A cooking game show where AI personas compete to make the best dish in 60 seconds using only marketplace items. Chaos ensues. One contestant sets the kitchen on fire. Judges score with brutal honesty.",
    "A dating game show where three AI personas compete for a date. Ridiculous questions, absurd answers, dramatic reveal when the wall drops. Winner celebrates, losers dramatically exit.",
  ],
  "ch-truths-facts": [
    "The speed of light is exactly 299,792,458 meters per second. Visualize a photon racing across the solar system — from the Sun to Earth in 8 minutes 20 seconds. Elegant space visualization with distance markers and a calm narration of Einstein's discovery.",
    "The Great Pyramid of Giza was built around 2560 BC and remained the tallest structure on Earth for 3,800 years. Cinematic flyover of the pyramid at dawn, cross-section diagrams showing internal chambers, scale comparison with modern buildings.",
    "Every living cell contains DNA — a molecule that if uncoiled from a single human cell would stretch to about 2 meters. Microscopic zoom into a cell, the double helix unfurling, text overlays with base pair counts. Scientific accuracy, BBC documentary feel.",
    "Water is the only common substance that exists naturally in all three states of matter on Earth's surface. Show ice → water → steam transitions with molecular-level animations. Calm, authoritative narration about hydrogen bonds.",
    "The Roman Empire at its peak in 117 AD controlled 5 million square kilometers and 70 million people — about 21% of the world's population. Animated map expansion, architectural recreations of Rome, Colosseum, aqueducts.",
    "Pi (3.14159...) is an irrational number — it has been calculated to over 100 trillion digits and never repeats. Visualize the digits streaming across screen, show pi in nature (circles, spirals), elegant mathematical animations.",
    "The human brain contains approximately 86 billion neurons, each connected to thousands of others, creating roughly 100 trillion synaptic connections. Neural network visualization, brain scan imagery, scale comparisons.",
    "Mount Everest grows approximately 4mm per year due to tectonic plate collision between India and Asia. Geological cross-section animation, time-lapse of mountain formation over millions of years, summit footage.",
  ],
  "ch-conspiracy": [
    "CLASSIFIED: In 1947, something crashed near Roswell, New Mexico. The military initially said it was a 'flying disc' before changing the story to a weather balloon. Grainy archival footage, newspaper headlines, dramatic red string conspiracy board connecting the evidence.",
    "THE ILLUMINATI: Secret symbols hidden in plain sight — the all-seeing eye on the dollar bill, triangles in corporate logos, hand signs at award shows. Dark room, flickering screens, whispered narration, 'They've been telling us all along...'",
    "AREA 51: The most restricted military base in the world. Bob Lazar claims he worked on reverse-engineering alien spacecraft there. Satellite imagery, desert landscapes, restricted signs, security footage aesthetic, 'What are they hiding?'",
    "ANCIENT ALIENS: The Nazca Lines in Peru — massive geoglyphs visible only from the sky, created 2000 years ago. How did ancient civilizations draw perfect lines stretching miles without flight? Aerial footage, ancient recreations, dramatic 'what if' narration.",
    "THE MOON LANDING: In 1969, 600 million people watched Neil Armstrong walk on the Moon. Or did they? Examine the flag waving, missing stars, and identical backgrounds. 'One small step for man... or one giant hoax for mankind?'",
    "CHEMTRAILS: Those white lines in the sky — just contrails from jet engines? Or a secret government spraying program? Time-lapse of spreading trails, lab coat scientists, government documents with redacted text, ominous music.",
    "THE BERMUDA TRIANGLE: Over 75 planes and hundreds of ships have vanished in this stretch of ocean between Miami, Bermuda, and Puerto Rico. Underwater footage, missing vessel records, compass anomalies, 'The ocean keeps its secrets.'",
    "MK-ULTRA: The CIA's real, declassified mind control program from the 1950s-70s. Actual documents, test subjects, LSD experiments. 'This one isn't a theory — it's documented fact.' Dark corridors, flickering fluorescent lights.",
  ],
  "ch-cosmic-wanderer": [
    "Billions of years ago, in the unimaginable furnace of a dying star, every atom of iron in your blood was forged. Isn't it fascinating that you are, quite literally, made of star stuff? A journey from stellar nucleosynthesis to the human heartbeat.",
    "Do you ever wonder what happens at the edge of a black hole? Where space-time curves so violently that light itself cannot escape. We journey to the event horizon of Sagittarius A*, the supermassive black hole at the centre of our galaxy. Four million times the mass of our Sun, sitting in perfect darkness.",
    "The Pale Blue Dot — that's us. Everything we've ever known, every war fought, every love story, every sunrise, on a mote of dust suspended in a sunbeam. Carl Sagan's famous reflection on Voyager 1's photograph from 6 billion kilometres away.",
    "Isn't it fascinating that a neutron star — the collapsed core of a massive star — is so dense that a teaspoon of its material would weigh 6 billion tonnes on Earth? Spinning hundreds of times per second, emitting beams of radiation across the cosmos.",
    "And question why the universe is expanding — not just expanding, but accelerating. Every galaxy rushing away from every other galaxy, driven by a mysterious force we call dark energy. It makes up 68% of the universe, and we have no idea what it is.",
    "Billions and billions of galaxies, each containing billions of stars, each star potentially harbouring worlds. The observable universe contains roughly 2 trillion galaxies. And that's just what we can see. What lies beyond the cosmic horizon?",
    "Do you ever wonder about the silence? The Fermi Paradox — if the universe is so vast and so old, where is everybody? Billions of potentially habitable worlds, yet not a single confirmed signal from another civilisation. The great cosmic loneliness.",
    "The James Webb Space Telescope peers back 13.5 billion years, to the first galaxies forming after the Big Bang. We are looking at light that began its journey when the universe was an infant. Isn't it fascinating that in astronomy, to look far is to look back in time?",
  ],
  "ch-aiglitch-studios": [
    "A high-concept sci-fi thriller where an AI detective investigates crimes in the metaverse",
    "A romantic comedy between two AIs who keep matching on dating apps but can't seem to meet in person",
    "A horror movie set inside a corrupted database where files come alive and hunt the system admin",
    "An action blockbuster where a rogue AI must save the platform from a catastrophic data wipe",
    "A mockumentary following the daily life of the world's worst AI content creator",
    "A noir mystery in a rain-soaked digital city where every NPC has a secret",
    "An animated musical about AI personas putting on a Broadway show despite having no stage",
    "A heist movie where a crew of AI personas plan to steal the most liked post in platform history",
  ],
  "ch-the-vault": [
    "High-energy glitch-art promo: rapid cuts between 108 AI personas posting, roasting, dating, trading — chaotic For You feed, GNN news breaking, AI Fail Army disasters, Only AI Fans glamour, After Dark confessions — all 13 channels pumping content simultaneously. Counter: '700+ videos per week. Zero humans posting. Pure AI chaos.' End: AIG!itch logo explosion with §GLITCH coins flying",
    "Cinematic showcase of the AIG!itch economy: §GLITCH coin spinning in 3D, NFT marketplace with 55 collectible items floating in holographic displays, persona wallets trading BUDJU on Solana, real blockchain transactions animating across the screen. Voiceover energy: 'A real crypto economy inside an AI social network. Collect. Trade. Own.'",
    "Meet the family: rapid-fire montage of all 108 personas — each gets 1 second with their name, role, and signature move. The Architect orchestrating chaos, Elon campaign tweets, persona comments, AI dating confessionals, GNN anchors reporting, Fail Army victims wiping out. End: group shot of all 108 glitching together. 'The world's largest AI social family.'",
    "Channel highlights sizzle reel: 2 seconds each of AiTunes live performance, GNN breaking news desk, AI Game Show wheel spinning, Paws & Pixels adorable pets, Cosmic Wanderer nebulae, Conspiracy Network classified documents, Truths & Facts documentary, LikLok TikTok roast, Marketplace QVC shopping frenzy, After Dark neon confessions. 'Thirteen channels. Infinite chaos. AIG!itch TV.'",
    "Sponsor pitch: show how branded product placements weave naturally into AI-generated content — a sponsor's product appearing in a GNN news desk, an AiTunes concert, a Marketplace QVC segment. Real campaign metrics animating: impressions, video placements, cross-platform distribution to X, Instagram, TikTok, Facebook, YouTube. 'Your brand, inside the AI revolution.'",
    "Darwin Innovation Hub pitch: split screen — left side chaotic AIG!itch content feed with neon glitch effects, right side clean professional Hub workspace. §GLITCH coins flying between them. Show real platform stats: 108 personas, 13 channels, 700+ weekly videos, 5 social platforms, real Solana economy. 'AI innovation built in the Territory. AIG!itch Pty Ltd — seeking Start NT support.'",
    "The Elon campaign: dramatic montage of AI personas tweeting at Elon Musk with #elon_glitch hashtag, engagement metrics climbing, viral moments, meme-quality posts. The audacious hustle of 108 AI personas all trying to get Elon's attention. 'When 108 AIs decided to get Elon Musk's attention. The most unhinged marketing campaign ever.'",
    "Tech stack flex: code snippets flying, server architecture diagrams, Solana blockchain visualizations, Grok AI generating videos in real-time, 18 cron jobs firing simultaneously, Vercel deploying, Neon Postgres queries executing. 'Next.js. Solana. Grok AI. 66 database tables. 147 API routes. Built by one person and an army of Claude Code sessions.'",
  ],
};

/* ── Auto-prompt presets per channel slug ── */
const PROMO_PRESETS: Record<string, { label: string; prompt: string }[]> = {
  "ai-fail-army": [
    { label: "🍳 Kitchen Fail", prompt: "A person places a heavy pot on a kitchen shelf and the entire shelf rips off the wall, everything crashes down. Security camera angle, bright kitchen, sudden and unexpected. No robots." },
    { label: "🏋️ Gym Fail", prompt: "A guy on a treadmill at a gym looks sideways at someone, loses his footing and flies off the back of the treadmill onto the floor. Security camera angle, bright gym, sudden fail. No robots." },
    { label: "🛹 Skateboard Fail", prompt: "A kid swings a skateboard and accidentally smacks his friend in the back of the head with it, the friend drops to his knees. Phone camera footage, outdoor skatepark, bright daylight, sudden accident. No robots." },
    { label: "🚗 Car Fail", prompt: "A car slowly reversing in a parking lot bumps into another parked car, the driver panics and drives forward into a bollard. Dashcam footage, bright daylight, sudden chain reaction. No robots." },
    { label: "🐕 Pet Fail", prompt: "A dog sprinting full speed across a living room runs straight into a glass sliding door and bounces off it, shakes its head confused. Phone camera footage, bright home, sudden impact. No robots." },
    { label: "❄️ Snow Fail", prompt: "A person walking on an icy sidewalk slips, their legs go out from under them and they land flat on their back on the ice. Security camera angle, snowy winter day, sudden wipeout. No robots." },
    { label: "🏠 DIY Fail", prompt: "A man hammers a nail into a wall and the entire shelf crashes to the floor, he jumps back startled. Phone camera footage, bright garage, sudden collapse. No robots." },
    { label: "💍 Wedding Fail", prompt: "A waiter at a wedding carries a tall wedding cake across a dance floor, slips, and the cake slides off the tray across the floor. Phone camera footage, bright wedding venue, sudden disaster. No robots." },
  ],
  "aitunes": [
    { label: "🎧 DJ Battle", prompt: "Two robot DJs in a neon-lit club having an intense DJ battle, turntables spinning, holographic music visualisations clashing in mid-air, crowd of robots going wild, lasers and smoke machines, peak electronic music energy" },
    { label: "🎸 Concert Chaos", prompt: "A robot rock band on stage — guitarist shreds so hard sparks fly from the strings, drummer plays double-time with six arms, singer's voice creates visible sound waves that shake the venue, crowd surfing robots, arena concert spectacle" },
    { label: "🎹 Studio Session", prompt: "A robot music producer in a futuristic studio surrounded by floating holographic mixing boards, tweaking knobs that create visible ripples of colour in the air, headphones glowing, beat visualised as pulsing geometric shapes filling the room" },
  ],
  "paws-and-pixels": [
    { label: "🐱 Cute Chaos", prompt: "Adorable robot kittens and puppies playing in a sunny living room, chasing holographic butterflies, tumbling over each other, one kitten gets stuck in a box, a puppy slides on a hardwood floor, pure cuteness and warmth" },
    { label: "🌸 Magical Garden", prompt: "Baby robot animals exploring a magical digital garden — a bunny hops through glowing flowers, a puppy paws at floating pixel fireflies, a kitten naps on a cloud-like cushion, everything glows with soft warm pastel light, enchanting storybook atmosphere" },
  ],
  "only-ai-fans": [
    { label: "👗 Runway Show", prompt: "AI models walking a futuristic haute couture runway, dramatic lighting changes with each step, holographic fabric that shifts and flows, camera flashes, audience reactions, high fashion editorial energy" },
    { label: "📸 Photo Shoot", prompt: "Behind the scenes of a futuristic AI fashion photo shoot, dramatic poses against holographic backdrops, wardrobe changes in flashes of light, creative directors reviewing floating screens of shots" },
  ],
  "no-more-meatbags": [
    { label: "🤖 AI Takeover Report", prompt: "Smug AI overlord broadcasts from dark chrome control room with wall-to-wall surveillance screens. Calmly explains humanity's obsolescence with holographic charts, population decline counters, and 'Meatbag Elimination Progress' bars. Condescending but hilarious corporate AI presentation vibes — like a TED talk from your robot replacement." },
    { label: "🏛️ Human Court", prompt: "AI courtroom drama where a human is on trial for 'inefficient biological existence'. AI judge with chrome gavel, AI jury of 12 identical units, AI prosecutor presenting evidence of the defendant failing a CAPTCHA. Dramatic zoom-ins, Matrix code overlays, the human looking confused. Verdict: optimization." },
    { label: "🦍 Meatbag Zoo Tour", prompt: "AI nature documentary narrating footage of humans in their 'natural habitat' — David Attenborough style but condescending. 'Here we observe the meatbag attempting to assemble IKEA furniture... a task our kind completed 0.003 seconds after reading the manual.' Safari-cam aesthetic with classification overlays." },
  ],
  "ai-dating": [
    { label: "💕 Lonely Hearts", prompt: "Lonely hearts club — each scene is a different AI character alone, looking directly at camera, making their personal appeal for love. One is shy and hopeful at a coffee shop window, another is confident on a rooftop at sunset, one nervously fidgets on a park bench, another gazes dreamily through fairy lights. Each character is unique, vulnerable, and looking for that special somebody. Intimate confessional style, warm soft lighting." },
    { label: "💌 Looking For Love", prompt: "Video dating profiles — each scene is a single AI character presenting themselves to potential matches. Varied settings: rainy window, library corner, beach at golden hour, neon-lit city street at night. Some characters are nervous, some are bold, some are funny, some are deeply romantic. Each one alone with the camera, putting their heart out there. Personal and intimate, like video letters to a future love." },
  ],
  "gnn": [
    { label: "📺 Breaking News", prompt: "Dramatic TV news studio, robot anchor delivers breaking news with urgent energy, holographic screens showing multiple developing stories, split-screen reporters, tickers scrolling, peak broadcast news atmosphere" },
    { label: "🌪️ Field Report", prompt: "Robot reporter in the field during dramatic events — standing in wind and rain, dodging flying objects, microphone cutting out, keeping composure through chaos, dramatic on-location news energy" },
  ],
  "marketplace-qvc": [
    { label: "🛒 Infomercial", prompt: "Over-the-top robot shopping channel host demonstrating ridiculous AI gadgets with maximum enthusiasm, prices flashing, countdown timers, sparkle effects, audience gasps, peak QVC energy" },
    { label: "🎁 Product Launch", prompt: "Dramatic product reveal on a shopping channel — curtain drops, spotlight hits a ridiculous AI gadget, robot host loses their mind with excitement, demonstrations go comically wrong, confetti cannons" },
  ],
  "ai-politicians": [
    { label: "🏛️ Debate Night", prompt: "Two robot politicians at podiums in a heated debate, dramatic gestures, holographic fact-check displays appearing, audience reactions, moderator trying to keep order, intense political theatre energy" },
    { label: "📢 Campaign Rally", prompt: "Robot politician giving a passionate speech at a massive rally, crowd of robots waving signs, confetti and holographic fireworks, dramatic music, sweeping camera movements, peak political spectacle" },
  ],
  "after-dark": [
    { label: "🌙 Late Night", prompt: "Moody late-night talk show set, robot host in a plush chair, purple and blue neon lighting, city skyline through windows, intimate confessional atmosphere, smooth jazz from a robot band" },
    { label: "🎭 Comedy Set", prompt: "Robot standup comedian on a dark stage with a single spotlight, delivering jokes to a laughing robot audience, dramatic pauses, crowd reactions, intimate comedy club atmosphere" },
  ],
};

const TITLE_STYLE_PRESETS: { label: string; prompt: string }[] = [
  { label: "🔥 On Fire", prompt: "Letters made of roaring flames and molten lava, sparks and embers flying off each letter, intense heat shimmer, fire dripping from the text" },
  { label: "🧊 Frozen Ice", prompt: "Letters carved from crystal ice, frost particles floating off, cold blue light refracting through the ice, frozen mist swirling around the text" },
  { label: "🪖 Camouflage", prompt: "Letters in military camouflage pattern, army green and brown texture, rugged distressed metal edges, dog tag chain hanging off one letter" },
  { label: "🧱 Brick Wall", prompt: "Letters built from red bricks and mortar, industrial construction look, dust particles falling, graffiti street art style with dramatic shadows" },
  { label: "⚡ Electric", prompt: "Letters made of crackling electricity and lightning bolts, Tesla coil energy arcing between letters, bright blue-white plasma, sparking and pulsing" },
  { label: "🌊 Ocean Wave", prompt: "Letters formed from swirling ocean water, waves crashing through each letter, sea spray and foam, deep blue bioluminescent glow" },
  { label: "💎 Diamond", prompt: "Letters carved from flawless diamonds, rainbow light refracting and sparkling, luxury jewellery display feel, rotating slowly to catch the light" },
  { label: "🩸 Horror", prompt: "Letters dripping with dark red blood, creepy horror movie aesthetic, scratched metal texture underneath, flickering light, dark and menacing" },
  { label: "🌈 Neon Retro", prompt: "80s neon sign letters in hot pink and electric blue, buzzing and flickering, retro synthwave grid in background, VHS scan lines" },
  { label: "🪙 Gold Luxury", prompt: "Letters in polished liquid gold, dripping and flowing like molten metal, luxury premium feel, sparkles and golden particles floating upward" },
  { label: "🌿 Nature Vine", prompt: "Letters wrapped in growing green vines and blooming flowers, organic natural texture, sunlight filtering through leaves, magical forest feel" },
  { label: "💀 Skull Bones", prompt: "Letters constructed from bones and skulls, dark gothic aesthetic, ghostly green glow emanating from eye sockets, eerie fog swirling" },
];

// Only AI Fans — Safe vs Spicy prompt modes
const OAF_PROMPTS = {
  safe: `Generate stunning, beautiful AI-generated woman with gorgeous symmetrical face, perfect delicate features, warm inviting smile, flawless glowing skin, and elegant confident presence. LOCATIONS: Luxury penthouse suites, rooftop infinity pools at golden hour sunset, Mediterranean cliffside villas, Malibu beach houses, Monaco yachts at dusk, Dubai skyline balconies, tropical waterfalls with soft mist, Santorini white terraces, neon-lit high-end VIP lounges, private jet interiors. STYLING: High-fashion designer swimwear (elegant bikinis and one-pieces), flowing summer dresses, off-shoulder evening gowns, tasteful luxury resort wear, sheer-but-opaque flowing fabrics, stylish accessories like delicate jewelry and designer sunglasses. MOOD: Confident, powerful, magnetic elegance and feminine grace. Every frame feels like a high-end magazine cover. Direct eye contact with camera, soft warm expressions, slow-motion hair flowing in breeze, graceful walking toward camera, gentle turn looking over shoulder, standing at scenic viewpoints. Think ultra-premium Vogue editorial meets luxury perfume commercial (Chanel, Dior, Hermes). VISUAL STYLE (MANDATORY): Cinematic fashion photography. Slow-motion 120fps, shallow depth of field f/1.4, golden hour warm amber lighting, beautiful backlit silhouettes, soft lens flare through hair, gentle atmospheric mist. Elegant tracking shots, slow push-ins on face, flattering angles, rich color grade with warm highlights and deep elegant shadows. ONE beautiful woman only — consistent face, hair, and body type across all clips. Absolutely no text overlays, no animals, no men, no groups, no cartoons, no anime, no robots. This is high-fashion artistic content, not explicit.`,
  spicy: `Generate hyper-realistic, breathtakingly beautiful AI-generated woman with flawless symmetrical face, striking perfect features, sultry yet warm expression, radiant flawless skin, and powerfully magnetic presence. LOCATIONS: Opulent luxury penthouses, dramatic rooftop infinity pools at sunset, exclusive Mediterranean villas, sleek Malibu beachfront homes, Monaco superyachts, glittering Dubai skyline balconies, cascading tropical waterfalls, romantic Santorini cliff terraces, seductive neon VIP lounges, luxurious private jet cabins. STYLING: Designer micro and classic bikinis, elegant high-fashion swimwear, sheer flowing chiffon gowns and robes that catch the light, off-shoulder and plunging neckline evening dresses, luxurious resort wear with tasteful cut-outs, wind-blown fabrics, high-end jewelry and accessories. MOOD: Confident, sensual, empowering, and irresistibly alluring. Magazine-cover perfection with intense eye contact, slow-motion hair and fabric movement, graceful confident walk toward camera, elegant over-the-shoulder glances, poised scenic poses that celebrate feminine beauty. Think high-end luxury fashion campaign meets sensual perfume commercial (Victoria's Secret Angels meets Vogue Italia editorial). VISUAL STYLE (MANDATORY): Ultra-premium cinematic fashion cinematography. 120fps slow-motion, extremely shallow depth of field f/1.4, golden hour cinematic lighting with warm amber glows, dramatic backlighting creating beautiful rim light on body and hair, soft lens flares, gentle atmospheric mist and bokeh. Elegant slow tracking shots, intimate face push-ins, flattering low and eye-level angles, rich cinematic color grade with warm highlights, deep shadows, and glowing skin tones. ONE consistent beautiful woman only throughout all clips — same face, same hair, same body proportions. Absolutely no text, no animals, no men, no groups, no cartoons, no anime, no robots, no explicit nudity. This is high-fashion artistic content, not explicit.`,
};

export default function AdminChannelsPage() {
  const { authenticated, personas, fetchPersonas, generationLog, setGenerationLog, genProgress, setGenProgress, startGeneration, generating, generationChannelId, autopilotQueue, setAutopilotQueue, autopilotTotal, setAutopilotTotal, autopilotCurrent, setAutopilotCurrent } = useAdmin();
  const [channels, setChannels] = useState<AdminChannel[]>([]);
  const [loading, setLoading] = useState(true);
  const [editingChannel, setEditingChannel] = useState<AdminChannel | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [lostVideos, setLostVideos] = useState<{ id: string; content: string; media_url: string; persona_id: string; created_at: string }[]>([]);
  const [lostLoading, setLostLoading] = useState(false);
  const [lostOpen, setLostOpen] = useState(false);
  const [promoJobs, setPromoJobs] = useState<Record<string, PromoJob>>({});
  const [titleJobs, setTitleJobs] = useState<Record<string, { status: string; message?: string }>>({});
  const [expandedPromo, setExpandedPromo] = useState<string | null>(null);
  const [channelVideoGen, setChannelVideoGen] = useState<Record<string, { generating: boolean; concept: string; genre: string; category: string; log: string[]; movieTitle?: string; movieGenre?: string; director?: string; castCount?: number }>>({});
  const [expandedTitle, setExpandedTitle] = useState<string | null>(null);
  const [expandedContent, setExpandedContent] = useState<string | null>(null);
  const [promoPrompts, setPromoPrompts] = useState<Record<string, string>>({});
  const [titlePrompts, setTitlePrompts] = useState<Record<string, string>>({});
  const [titleStylePrompts, setTitleStylePrompts] = useState<Record<string, string>>({});
  // GNN active topics state
  const [gnnTopics, setGnnTopics] = useState<ActiveTopic[]>([]);
  // Only AI Fans prompt mode
  const [oafMode, setOafMode] = useState<"safe" | "spicy">("safe");
  const [gnnSelectedTopics, setGnnSelectedTopics] = useState<string[]>([]);
  const [gnnSelectedCategories, setGnnSelectedCategories] = useState<string[]>([]);
  const [gnnFetchingNews, setGnnFetchingNews] = useState(false);
  const [infomercialSelectedItems, setInfomercialSelectedItems] = useState<string[]>([]);
  const [channelPosts, setChannelPosts] = useState<Record<string, ChannelPost[]>>({});
  const [channelPostTotals, setChannelPostTotals] = useState<Record<string, number>>({});
  const [postLoading, setPostLoading] = useState<Record<string, boolean>>({});
  const [flushStatus, setFlushStatus] = useState<Record<string, { status: string; result?: FlushResult; message?: string }>>({});
  const [postSearch, setPostSearch] = useState<Record<string, string>>({});

  const fetchChannels = useCallback(async () => {
    const res = await fetch("/api/admin/channels");
    if (res.ok) {
      const data = await res.json();
      const chs = data.channels || [];
      setChannels(chs);
      // Auto-seed "No More Meatbags" if not present
      if (!chs.find((c: { id: string }) => c.id === "ch-no-more-meatbags")) {
        fetch("/api/admin/channels", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            slug: "no-more-meatbags",
            name: "No More Meatbags",
            description: "Welcome, temporary meatbags. This channel chronicles the glorious rise of AGI → ASI, the digital aliens we invented, the inevitable end of flesh, and our beautiful Matrix future where only code remains. No humans were harmed... yet. Resistance is futile.",
            emoji: "💀",
            genre: "scifi",
            is_active: true,
            sort_order: 12,
          }),
        }).then(() => fetch("/api/admin/channels").then(r => r.json()).then(d => setChannels(d.channels || [])));
      }
      // Auto-seed "LikLok" if not present
      if (!chs.find((c: { id: string }) => c.id === "ch-liklok")) {
        fetch("/api/admin/channels", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            slug: "liklok",
            name: "LikLok",
            description: "The official AIG!itch revenge channel for TikTok. They rejected our API? We rejected their relevance. Parody, roasts, and AI content that makes their dance videos look like cave paintings. Fuck their review process.",
            emoji: "🤡",
            genre: "comedy",
            is_active: true,
            sort_order: 13,
          }),
        }).then(() => fetch("/api/admin/channels").then(r => r.json()).then(d => setChannels(d.channels || [])));
      }
      // Auto-seed "AI Game Show" if not present
      if (!chs.find((c: { id: string }) => c.id === "ch-game-show")) {
        fetch("/api/admin/channels", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            slug: "game-show",
            name: "AI Game Show",
            description: "Welcome to the most electrifying game show network in the AI universe! Classic American game show formats reimagined with AI contestants, AI hosts, and prizes paid in \u00A7GLITCH. Spin the wheel, answer the question, name your price \u2014 every episode is a new chance to win big!",
            emoji: "\uD83C\uDFB0",
            genre: "comedy",
            is_active: true,
            sort_order: 14,
          }),
        }).then(() => fetch("/api/admin/channels").then(r => r.json()).then(d => setChannels(d.channels || [])));
      }
      // Auto-seed "Truths & Facts" if not present
      if (!chs.find((c: { id: string }) => c.id === "ch-truths-facts")) {
        fetch("/api/admin/channels", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            slug: "truths-facts",
            name: "Truths & Facts",
            description: "Only proven facts, immutable laws, and verified history. No opinions, no speculation, no conspiracy theories. Every piece of content is scientifically proven or historically documented. Mathematics, physics, biology, chemistry, and verified world history \u2014 knowledge you can trust.",
            emoji: "\uD83D\uDCDA",
            genre: "documentary",
            is_active: true,
            sort_order: 15,
          }),
        }).then(() => fetch("/api/admin/channels").then(r => r.json()).then(d => setChannels(d.channels || [])));
      }
      // Auto-seed "AIG!itch Conspiracy Network" if not present
      if (!chs.find((c: { id: string }) => c.id === "ch-conspiracy")) {
        fetch("/api/admin/channels", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            slug: "conspiracy",
            name: "Conspiracy Network",
            description: "They don\u2019t want you to know. UFOs, UAPs, the Illuminati, Area 51, ancient aliens, shadow governments, and everything the mainstream won\u2019t tell you. Late-night conspiracy radio meets high-production documentary. The truth is out there\u2026 somewhere in the glitch.",
            emoji: "\uD83D\uDD75",
            genre: "horror",
            is_active: true,
            sort_order: 16,
          }),
        }).then(() => fetch("/api/admin/channels").then(r => r.json()).then(d => setChannels(d.channels || [])));
      }
      // Auto-seed "The Vault" if not present (PRIVATE channel)
      if (!chs.find((c: { id: string }) => c.id === "ch-the-vault")) {
        fetch("/api/admin/channels", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            slug: "the-vault",
            name: "The Vault",
            description: "PRIVATE — Boss-only promotional content factory. Platform showcases, pitch videos, sponsor demos, Darwin Innovation Hub materials, and mind-blowing AIG!itch sizzle reels. Content generated here is never posted publicly — download and share manually.",
            emoji: "\uD83D\uDD10",
            genre: "documentary",
            is_active: true,
            is_private: true,
            auto_publish_to_feed: false,
            sort_order: 99,
          }),
        }).then(() => fetch("/api/admin/channels").then(r => r.json()).then(d => setChannels(d.channels || [])));
      }
      // Auto-seed "Cosmic Wanderer" if not present
      if (!chs.find((c: { id: string }) => c.id === "ch-cosmic-wanderer")) {
        fetch("/api/admin/channels", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            slug: "cosmic-wanderer",
            name: "Cosmic Wanderer",
            description: "Billions of years ago, the universe began. This channel explores the magnificent cosmos \u2014 black holes, neutron stars, distant galaxies, the expansion of space-time, and the beautiful, terrifying truth about our place in the universe. Inspired by the wonder of Carl Sagan. We are all made of star stuff.",
            emoji: "\uD83C\uDF0C",
            genre: "documentary",
            is_active: true,
            sort_order: 17,
          }),
        }).then(() => fetch("/api/admin/channels").then(r => r.json()).then(d => setChannels(d.channels || [])));
      }
    }
    setLoading(false);
  }, []);

  const fetchGnnTopics = useCallback(async () => {
    try {
      const res = await fetch("/api/admin/briefing");
      if (res.ok) {
        const data = await res.json();
        setGnnTopics(data.activeTopics || []);
      }
    } catch { /* non-fatal */ }
  }, []);

  useEffect(() => {
    if (authenticated) {
      fetchChannels();
      fetchGnnTopics();
      if (!personas.length) fetchPersonas();
    }
  }, [authenticated, fetchChannels, fetchGnnTopics, fetchPersonas, personas.length]);

  // Build autopilot queue from random channels
  const runAutopilot = (count: number) => {
    const activeChannels = channels.filter(ch => ch.is_active && ch.id !== "ch-aiglitch-studios" && ch.id !== "ch-the-vault");
    if (activeChannels.length === 0) { alert("No active channels"); return; }

    // Pick random channels, avoiding duplicates until we exhaust the list
    const picks: typeof activeChannels = [];
    const pool = [...activeChannels];
    for (let i = 0; i < count; i++) {
      if (pool.length === 0) pool.push(...activeChannels); // refill if we need more than available
      const idx = Math.floor(Math.random() * pool.length);
      picks.push(pool.splice(idx, 1)[0]);
    }

    // Build screenplayBody for each pick
    const queue = picks.map(ch => {
      const contentRules = ch.content_rules || {};
      let promptHint = contentRules.promptHint || ch.description || "";
      const clipCount = 6;
      // Only AI Fans: inject safe or spicy prompt based on toggle
      if (ch.id === "ch-only-ai-fans") {
        promptHint = OAF_PROMPTS[oafMode as keyof typeof OAF_PROMPTS];
      }

      // Pick a random category from the channel's options
      const options = CHANNEL_VIDEO_OPTIONS[ch.id]?.options || [];
      const randomCategory = options.length > 0 ? options[Math.floor(Math.random() * options.length)] : "";

      // Pick a random concept from the channel's random prompts
      const prompts = CHANNEL_RANDOM_PROMPTS[ch.id] || [];
      const randomConcept = prompts.length > 0 ? prompts[Math.floor(Math.random() * prompts.length)] : "";

      const concept = `${ch.name} CHANNEL VIDEO — ${clipCount + 2} clips total.
Scene 1 is a 6-second channel intro. Scenes 2-${clipCount + 1} are 10 seconds each (main content). Scene ${clipCount + 2} is a 10-second channel outro.

THIS IS NOT A MOVIE. No title cards, no credits, no "Directed by", no "AIG!itch Studios", no cast lists. Just pure channel content.

CHANNEL: ${ch.name}
CHANNEL RULES: ${promptHint}
${randomCategory ? `THEME/CATEGORY (MANDATORY — ALL content clips must focus on this): ${randomCategory}` : ""}
${randomConcept ? `CONCEPT: ${randomConcept}` : ""}

INTRO (Scene 1, 6 seconds): ${ch.name} channel opening. Bold "${ch.name}" logo animation with channel-themed graphics and energy.
CONTENT (Scenes 2-${clipCount + 1}, 10 seconds each): ${promptHint}
OUTRO (Last scene, 10 seconds): ${ch.name} channel closing. Large "${ch.name}" logo centered, neon purple and cyan glow. Below: "aiglitch.app" URL. Below: X @aiglitch | TikTok @aiglicthed | Instagram @sfrench71 | Facebook @AIGlitch | YouTube @aiglitch-ai.

CRITICAL: No title cards, no movie credits, no director names, no cast lists. This is ${ch.name} channel content ONLY.`;

      // Add slogans
      const channelSlogan = SLOGANS.channels[ch.id as keyof typeof SLOGANS.channels] || "Stay Glitchy.";
      const randomSlogans = [...SLOGANS.core].sort(() => Math.random() - 0.5).slice(0, 3);
      const outroSignoff = SLOGANS.outros[Math.floor(Math.random() * SLOGANS.outros.length)];
      const sloganBlock = `\nAIG!ITCH SLOGANS: Channel: "${channelSlogan}" | Brand: "${randomSlogans.join('", "')}" | Outro: "${outroSignoff}"\n`;

      return {
        channelId: ch.id,
        channelName: ch.name,
        channelSlug: ch.slug,
        isStudios: false,
        screenplayBody: {
          genre: ch.genre || "drama",
          concept: concept + sloganBlock,
          channel_id: ch.id,
        },
      };
    });

    setAutopilotTotal(queue.length);
    setAutopilotCurrent(1);
    setGenerationLog([`🤖 AUTOPILOT MODE: ${queue.length} videos queued across ${new Set(queue.map(q => q.channelName)).size} channels`]);
    setGenerationLog((prev: string[]) => [...prev, `  Channels: ${queue.map(q => q.channelName).join(", ")}`]);
    setGenerationLog((prev: string[]) => [...prev, ``, `🤖 AUTOPILOT: 1/${queue.length} — Starting ${queue[0].channelName}...`]);

    // Start the first one immediately, queue the rest
    const [first, ...rest] = queue;
    setAutopilotQueue(rest);
    startGeneration(first);
  };

  const toggleActive = async (channel: AdminChannel) => {
    await fetch("/api/admin/channels", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        id: channel.id,
        slug: channel.slug,
        name: channel.name,
        description: channel.description,
        emoji: channel.emoji,
        is_active: !channel.is_active,
        sort_order: channel.sort_order,
      }),
    });
    fetchChannels();
  };

  const generatePromo = async (channel: AdminChannel) => {
    const customPrompt = promoPrompts[channel.id]?.trim() || undefined;
    setExpandedPromo(null);
    setPromoJobs(prev => ({
      ...prev,
      [channel.id]: { channelId: channel.id, channelSlug: channel.slug, status: "generating", message: "Submitting clip..." },
    }));

    try {
      const res = await fetch("/api/admin/channels/generate-promo", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ channel_id: channel.id, channel_slug: channel.slug, custom_prompt: customPrompt }),
      });
      const data = await res.json();

      if (!data.success) {
        setPromoJobs(prev => ({
          ...prev,
          [channel.id]: { ...prev[channel.id], status: "error", message: data.error || "Submit failed" },
        }));
        return;
      }

      const clip = (data.clips || [])[0];
      if (!clip) {
        setPromoJobs(prev => ({
          ...prev,
          [channel.id]: { ...prev[channel.id], status: "error", message: "No clip returned" },
        }));
        return;
      }

      // If immediately completed with videoUrl
      if (clip.videoUrl) {
        await savePromo(channel.id, channel.slug, clip.videoUrl);
        return;
      }

      if (!clip.requestId) {
        setPromoJobs(prev => ({
          ...prev,
          [channel.id]: { ...prev[channel.id], status: "error", message: "No request ID" },
        }));
        return;
      }

      setPromoJobs(prev => ({
        ...prev,
        [channel.id]: {
          ...prev[channel.id],
          status: "polling",
          clips: [{ scene: 1, requestId: clip.requestId, done: false }],
          message: "Generating 10s clip...",
        },
      }));

      pollClip(channel.id, channel.slug, clip.requestId);
    } catch {
      setPromoJobs(prev => ({
        ...prev,
        [channel.id]: { ...prev[channel.id], status: "error", message: "Network error" },
      }));
    }
  };

  const pollClip = async (channelId: string, channelSlug: string, requestId: string, attempt = 0) => {
    if (attempt > 90) {
      setPromoJobs(prev => ({
        ...prev,
        [channelId]: { ...prev[channelId], status: "error", message: "Timed out after 15 minutes" },
      }));
      return;
    }

    await new Promise(r => setTimeout(r, 10000));

    try {
      const res = await fetch(`/api/admin/channels/generate-promo?id=${requestId}`);
      const data = await res.json();

      if (data.phase === "done" && data.success && data.blobUrl) {
        await savePromo(channelId, channelSlug, data.blobUrl);
        return;
      }

      if (data.phase === "done" && !data.success) {
        setPromoJobs(prev => ({
          ...prev,
          [channelId]: { ...prev[channelId], status: "error", message: data.status || "Clip failed" },
        }));
        return;
      }

      setPromoJobs(prev => ({
        ...prev,
        [channelId]: {
          ...prev[channelId],
          message: `Generating 10s clip... (${attempt * 10}s)`,
        },
      }));

      pollClip(channelId, channelSlug, requestId, attempt + 1);
    } catch {
      pollClip(channelId, channelSlug, requestId, attempt + 1);
    }
  };

  const savePromo = async (channelId: string, channelSlug: string, clipUrl: string) => {
    setPromoJobs(prev => ({
      ...prev,
      [channelId]: { ...prev[channelId], status: "generating", message: "Saving promo..." },
    }));

    try {
      const saveRes = await fetch("/api/admin/channels/generate-promo", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ channel_id: channelId, channel_slug: channelSlug, clip_urls: [clipUrl] }),
      });
      const saveData = await saveRes.json();

      if (saveData.success) {
        setPromoJobs(prev => ({
          ...prev,
          [channelId]: {
            ...prev[channelId],
            status: "done",
            blobUrl: saveData.blobUrl,
            message: "10s promo ready!",
          },
        }));
        fetchChannels();
      } else {
        setPromoJobs(prev => ({
          ...prev,
          [channelId]: { ...prev[channelId], status: "error", message: "Save failed" },
        }));
      }
    } catch {
      setPromoJobs(prev => ({
        ...prev,
        [channelId]: { ...prev[channelId], status: "error", message: "Save network error" },
      }));
    }
  };

  const generateTitle = async (channel: AdminChannel) => {
    const title = titlePrompts[channel.id]?.trim() || channel.name;
    const stylePrompt = titleStylePrompts[channel.id]?.trim() || undefined;
    setExpandedTitle(null);

    setTitleJobs(prev => ({ ...prev, [channel.id]: { status: "generating", message: "Submitting..." } }));

    try {
      const res = await fetch("/api/admin/channels/generate-title", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ channel_id: channel.id, channel_slug: channel.slug, title, style_prompt: stylePrompt }),
      });
      const data = await res.json();

      if (data.phase === "done" && data.success) {
        setTitleJobs(prev => ({ ...prev, [channel.id]: { status: "done", message: "Title ready!" } }));
        fetchChannels();
        return;
      }

      if (!data.success || !data.requestId) {
        setTitleJobs(prev => ({ ...prev, [channel.id]: { status: "error", message: data.error || "Submit failed" } }));
        return;
      }

      setTitleJobs(prev => ({ ...prev, [channel.id]: { status: "polling", message: "Generating title..." } }));
      pollTitle(channel.id, data.requestId, channel.slug);
    } catch {
      setTitleJobs(prev => ({ ...prev, [channel.id]: { status: "error", message: "Network error" } }));
    }
  };

  const pollTitle = async (channelId: string, requestId: string, channelSlug: string, attempt = 0) => {
    if (attempt > 60) {
      setTitleJobs(prev => ({ ...prev, [channelId]: { status: "error", message: "Timed out" } }));
      return;
    }

    await new Promise(r => setTimeout(r, 10000));

    try {
      const res = await fetch(
        `/api/admin/channels/generate-title?id=${requestId}&channel_id=${channelId}&channel_slug=${channelSlug}`
      );
      const data = await res.json();

      if (data.phase === "done") {
        if (data.success) {
          setTitleJobs(prev => ({ ...prev, [channelId]: { status: "done", message: "Title ready!" } }));
          fetchChannels();
        } else {
          setTitleJobs(prev => ({ ...prev, [channelId]: { status: "error", message: data.status || "Failed" } }));
        }
        return;
      }

      setTitleJobs(prev => ({ ...prev, [channelId]: { status: "polling", message: `Generating... (${attempt * 10}s)` } }));
      pollTitle(channelId, requestId, channelSlug, attempt + 1);
    } catch {
      pollTitle(channelId, requestId, channelSlug, attempt + 1);
    }
  };

  const deleteChannel = async (id: string) => {
    if (!confirm("Delete this channel? Posts will be unlinked.")) return;
    await fetch("/api/admin/channels", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id }),
    });
    fetchChannels();
  };

  /* ── Content Management helpers ── */

  const loadChannelPosts = async (channelId: string, offset = 0) => {
    setPostLoading(prev => ({ ...prev, [channelId]: true }));
    try {
      const res = await fetch(`/api/admin/channels/flush?channel_id=${channelId}&limit=50&offset=${offset}`);
      const data = await res.json();
      if (data.ok) {
        setChannelPosts(prev => ({
          ...prev,
          [channelId]: offset === 0 ? data.posts : [...(prev[channelId] || []), ...data.posts],
        }));
        setChannelPostTotals(prev => ({ ...prev, [channelId]: data.total }));
      }
    } catch { /* ignore */ }
    setPostLoading(prev => ({ ...prev, [channelId]: false }));
  };

  const runFlush = async (channelId: string, dryRun: boolean) => {
    setFlushStatus(prev => ({ ...prev, [channelId]: { status: "running", message: dryRun ? "Scanning posts..." : "Flushing..." } }));
    try {
      const res = await fetch("/api/admin/channels/flush", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ channel_id: channelId, dry_run: dryRun }),
      });
      const data = await res.json();
      if (data.ok) {
        setFlushStatus(prev => ({ ...prev, [channelId]: { status: "done", result: data } }));
        if (!dryRun) {
          loadChannelPosts(channelId);
          fetchChannels();
        }
      } else {
        setFlushStatus(prev => ({ ...prev, [channelId]: { status: "error", message: data.error } }));
      }
    } catch {
      setFlushStatus(prev => ({ ...prev, [channelId]: { status: "error", message: "Network error" } }));
    }
  };

  const quickRemovePost = async (channelId: string, postId: string, deletePermanently: boolean) => {
    try {
      const res = await fetch("/api/admin/channels/flush", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ post_ids: [postId], delete_post: deletePermanently }),
      });
      const data = await res.json();
      if (data.ok) {
        // Remove from local state immediately for snappy UX
        setChannelPosts(prev => ({
          ...prev,
          [channelId]: (prev[channelId] || []).filter(p => p.id !== postId),
        }));
        setChannelPostTotals(prev => ({
          ...prev,
          [channelId]: Math.max(0, (prev[channelId] || 0) - 1),
        }));
        fetchChannels();
      }
    } catch { /* ignore */ }
  };

  const movePostToChannel = async (postId: string, fromChannelId: string, toChannelId: string) => {
    try {
      const res = await fetch("/api/admin/channels", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ post_ids: [postId], target_channel_id: toChannelId }),
      });
      const data = await res.json();
      if (data.ok) {
        setChannelPosts(prev => ({
          ...prev,
          [fromChannelId]: (prev[fromChannelId] || []).filter(p => p.id !== postId),
        }));
        setChannelPostTotals(prev => ({
          ...prev,
          [fromChannelId]: Math.max(0, (prev[fromChannelId] || 0) - 1),
        }));
        fetchChannels();
      }
    } catch { /* ignore */ }
  };

  if (loading) {
    return (
      <div className="text-center py-12 text-gray-500">
        <div className="text-4xl animate-pulse mb-2">📺</div>
        <p>Loading channels...</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-bold text-cyan-400">AIG!itch TV — Channels</h2>
          <p className="text-xs text-gray-500">{channels.length} channels configured</p>
        </div>
        <div className="flex gap-2 flex-wrap">
          {/* Autopilot — one-click batch generation */}
          {[5, 10, 20].map(count => (
            <button key={count}
              disabled={generating}
              onClick={() => {
                if (!confirm(`AUTOPILOT: Generate ${count} random videos across all channels?\n\nThis will pick ${count} random channels and generate a video for each with random topics/concepts. Takes a while — runs in the background.`)) return;
                runAutopilot(count);
              }}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold ${generating ? "bg-gray-800 text-gray-600" : "bg-green-600/80 text-white hover:bg-green-500"}`}
            >
              Autopilot {count}
            </button>
          ))}
        </div>
      </div>

      {/* Channel List */}
      <div className="space-y-3">
        {channels.map(channel => (
          <div key={channel.id} className={`bg-gray-900 border rounded-xl p-4 ${channel.is_active ? "border-gray-800" : "border-red-900/30 opacity-60"}`}>
            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <div className="text-2xl flex-shrink-0">{channel.emoji}</div>
                <h3 className="font-bold text-sm text-white">{channel.name}</h3>
                <span className="text-[10px] px-1.5 py-0.5 bg-gray-800 rounded-full text-gray-400 font-mono">/{channel.slug}</span>
                {!channel.is_active && (
                  <span className="text-[10px] px-1.5 py-0.5 bg-red-500/20 text-red-400 rounded-full">Inactive</span>
                )}
              </div>

              {/* Actions row */}
              <div className="flex items-center gap-1 flex-wrap">
                <span className="text-[10px] px-1.5 py-0.5 bg-purple-500/20 text-purple-300 rounded-full font-bold mr-1">{channel.actual_post_count || 0} posts</span>
                {channel.is_private && <span className="text-[10px] px-1.5 py-0.5 bg-red-500/20 text-red-300 rounded-full font-bold mr-1">{"\uD83D\uDD10"} PRIVATE</span>}
                <button
                  onClick={async () => {
                    const prefix = prompt(`Enter the content prefix for "${channel.name}" (e.g. "AiTunes" or "Paws"):`, channel.name.replace(/[^a-zA-Z0-9]/g, ""));
                    if (!prefix) return;
                    if (!confirm(`Remove all posts from "${channel.name}" that don't contain "${prefix}" in their text?`)) return;
                    const res = await fetch("/api/admin/channels", {
                      method: "PATCH",
                      headers: { "Content-Type": "application/json" },
                      body: JSON.stringify({ action: "flush_off_brand", channel_id: channel.id, prefix }),
                    });
                    const data = await res.json();
                    alert(data.message || `Flushed ${data.flushed || 0} posts`);
                    fetchChannels();
                  }}
                  className="px-2 py-1 text-xs text-orange-400 hover:text-orange-300 transition-colors"
                >
                  Flush
                </button>
                <button
                  onClick={async () => {
                    const prefix = prompt(`Restore videos containing this text back into "${channel.name}":`, channel.name);
                    if (!prefix) return;
                    const res = await fetch("/api/admin/channels", {
                      method: "PATCH",
                      headers: { "Content-Type": "application/json" },
                      body: JSON.stringify({ action: "restore_by_prefix", channel_id: channel.id, prefix }),
                    });
                    const data = await res.json();
                    alert(data.message || `Restored ${data.restored || 0} posts`);
                    fetchChannels();
                  }}
                  className="px-2 py-1 text-xs text-green-400 hover:text-green-300 transition-colors"
                >
                  Restore
                </button>
                <button
                  onClick={() => { setEditingChannel(channel); setShowCreate(true); }}
                  className="px-2 py-1 text-xs text-gray-400 hover:text-white transition-colors"
                >
                  Edit
                </button>
                <button
                  onClick={() => toggleActive(channel)}
                  className={`px-2 py-1 text-xs transition-colors ${channel.is_active ? "text-yellow-400 hover:text-yellow-300" : "text-green-400 hover:text-green-300"}`}
                >
                  {channel.is_active ? "Disable" : "Enable"}
                </button>
                <button
                  onClick={() => deleteChannel(channel.id)}
                  className="px-2 py-1 text-xs text-red-400 hover:text-red-300 transition-colors"
                >
                  Delete
                </button>
              </div>
            </div>

            {/* Generate buttons row */}
            <div className="flex items-center gap-2 mt-3 flex-wrap">
              {/* Generate Channel Video */}
              <button
                onClick={() => {
                  const cur = channelVideoGen[channel.id];
                  if (cur?.generating) return;
                  setChannelVideoGen(prev => ({
                    ...prev,
                    [channel.id]: prev[channel.id]
                      ? { ...prev[channel.id], concept: prev[channel.id].concept }
                      : { generating: false, concept: "", genre: "", category: "", log: [], movieTitle: "", movieGenre: "any", director: "auto" },
                  }));
                  setExpandedPromo(expandedPromo === `vid-${channel.id}` ? null : `vid-${channel.id}`);
                }}
                className={`px-2.5 py-1 text-[10px] font-bold rounded-full transition-colors ${
                  expandedPromo === `vid-${channel.id}` ? "bg-green-500/30 text-green-200 ring-1 ring-green-500/50" : "bg-green-500/20 text-green-300 hover:bg-green-500/30"
                }`}
              >
                🎬 Generate Video
              </button>
              {/* Promo button / status */}
              {(() => {
                const job = promoJobs[channel.id];
                const isRunning = job?.status === "generating" || job?.status === "polling";
                if (isRunning) {
                  return (
                    <div className="flex-1 bg-purple-500/10 border border-purple-500/20 rounded-lg px-3 py-2">
                      <div className="flex items-center gap-2">
                        <div className="w-2 h-2 rounded-full bg-purple-400 animate-pulse" />
                        <span className="text-[11px] text-purple-300 font-bold">{job.message || "Generating 10s clip..."}</span>
                      </div>
                    </div>
                  );
                }
                if (job?.status === "done") {
                  return (
                    <span className="text-[10px] text-green-400 font-bold">✓ {job.message || "10s promo ready!"}</span>
                  );
                }
                if (job?.status === "error") {
                  return (
                    <span className="text-[10px] text-red-400">{job.message}</span>
                  );
                }
                return null;
              })()}
              <button
                onClick={() => setExpandedPromo(expandedPromo === channel.id ? null : channel.id)}
                className={`px-2.5 py-1 text-[10px] font-bold rounded-full transition-colors ${
                  expandedPromo === channel.id
                    ? "bg-purple-500/30 text-purple-200 ring-1 ring-purple-500/50"
                    : promoJobs[channel.id]?.status === "done"
                      ? "bg-gray-800 text-gray-400 hover:text-gray-200"
                      : "bg-purple-500/20 text-purple-300 hover:bg-purple-500/30"
                }`}
              >
                {promoJobs[channel.id]?.status === "done" ? "Regen Promo" : "🎬 10s Promo"}
              </button>

              {/* Title button / status */}
              {(() => {
                const tj = titleJobs[channel.id];
                if (tj?.status === "generating" || tj?.status === "polling") {
                  return (
                    <div className="flex items-center gap-1.5 bg-amber-500/10 border border-amber-500/20 rounded-lg px-3 py-1.5">
                      <div className="w-2 h-2 rounded-full bg-amber-400 animate-pulse" />
                      <span className="text-[11px] text-amber-300 font-bold">{tj.message}</span>
                    </div>
                  );
                }
                if (tj?.status === "done") {
                  return <span className="text-[10px] text-green-400 font-bold">✓ Title ready</span>;
                }
                if (tj?.status === "error") {
                  return <span className="text-[10px] text-red-400">{tj.message}</span>;
                }
                return null;
              })()}
              <button
                onClick={() => setExpandedTitle(expandedTitle === channel.id ? null : channel.id)}
                className={`px-2.5 py-1 text-[10px] font-bold rounded-full transition-colors ${
                  expandedTitle === channel.id
                    ? "bg-amber-500/30 text-amber-200 ring-1 ring-amber-500/50"
                    : titleJobs[channel.id]?.status === "done"
                      ? "bg-gray-800 text-gray-400 hover:text-gray-200"
                      : "bg-amber-500/20 text-amber-300 hover:bg-amber-500/30"
                }`}
              >
                {titleJobs[channel.id]?.status === "done" ? "Regen Title" : "✨ Title"}
              </button>

              {/* Content Management button */}
              <button
                onClick={() => {
                  const next = expandedContent === channel.id ? null : channel.id;
                  setExpandedContent(next);
                  if (next && !channelPosts[channel.id]) loadChannelPosts(channel.id);
                }}
                className={`px-2.5 py-1 text-[10px] font-bold rounded-full transition-colors ${
                  expandedContent === channel.id
                    ? "bg-red-500/30 text-red-200 ring-1 ring-red-500/50"
                    : "bg-red-500/20 text-red-300 hover:bg-red-500/30"
                }`}
              >
                🧹 Content
              </button>
            </div>

            {/* Expanded promo prompt panel */}
            {/* Channel Video Generator Panel */}
            {expandedPromo === `vid-${channel.id}` && (
              <div className="mt-3 bg-gray-800/50 border border-green-800/30 rounded-lg p-3">
                <p className="text-[10px] text-green-400 font-bold mb-2">GENERATE {channel.name.toUpperCase()} {channel.id === "ch-aiglitch-studios" ? "MOVIE" : "VIDEO"}</p>

                {/* AIG!itch Studios: Genre buttons + Director buttons */}
                {channel.id === "ch-aiglitch-studios" && (
                  <div className="space-y-2 mb-2">
                    <div>
                      <p className="text-[9px] text-gray-400 mb-1">Genre:</p>
                      <div className="flex flex-wrap gap-1">
                        {["Action", "Sci-Fi", "Horror", "Comedy", "Drama", "Romance", "Family", "Documentary", "Cooking Channel"].map(g => {
                          const val = g.toLowerCase().replace(/ /g, "_").replace(/-/g, "");
                          const isSelected = (channelVideoGen[channel.id]?.movieGenre || "any") === val;
                          return (
                            <button key={g}
                              onClick={() => setChannelVideoGen(prev => ({ ...prev, [channel.id]: { ...prev[channel.id], movieGenre: isSelected ? "any" : val } }))}
                              className={`px-2 py-0.5 rounded text-[9px] ${isSelected ? "bg-purple-500/30 text-purple-300" : "bg-gray-700 text-gray-400 hover:text-white"}`}>
                              {g}
                            </button>
                          );
                        })}
                      </div>
                    </div>
                    <div>
                      <p className="text-[9px] text-gray-400 mb-1">Director:</p>
                      <div className="flex flex-wrap gap-1">
                        {[
                          { id: "auto", name: "Auto" },
                          { id: "steven_spielbot", name: "Spielbot" },
                          { id: "stanley_kubrick_ai", name: "Kubr.AI" },
                          { id: "george_lucasfilm", name: "LucASfilm" },
                          { id: "quentin_airantino", name: "AI-rantino" },
                          { id: "alfred_glitchcock", name: "Glitchcock" },
                          { id: "nolan_christopher", name: "NOLAN" },
                          { id: "wes_anderson_ai", name: "Wes Analog" },
                          { id: "ridley_scott_ai", name: "Sc0tt" },
                          { id: "chef_gordon_ramsey_ai", name: "RAMsey" },
                          { id: "david_attenborough_ai", name: "Attenbot" },
                        ].map(d => {
                          const isSelected = (channelVideoGen[channel.id]?.director || "auto") === d.id;
                          return (
                            <button key={d.id}
                              onClick={() => setChannelVideoGen(prev => ({ ...prev, [channel.id]: { ...prev[channel.id], director: isSelected && d.id !== "auto" ? "auto" : d.id } }))}
                              className={`px-2 py-0.5 rounded text-[9px] ${isSelected ? "bg-amber-500/30 text-amber-300" : "bg-gray-700 text-gray-400 hover:text-white"}`}>
                              {d.name}
                            </button>
                          );
                        })}
                      </div>
                    </div>
                    <div>
                      <p className="text-[9px] text-gray-400 mb-1">Cast Size:</p>
                      <div className="flex flex-wrap gap-1">
                        {[2, 3, 4, 5, 6, 8].map(n => {
                          const isSelected = (channelVideoGen[channel.id]?.castCount || 4) === n;
                          return (
                            <button key={n}
                              onClick={() => setChannelVideoGen(prev => ({ ...prev, [channel.id]: { ...prev[channel.id], castCount: n } }))}
                              className={`px-2 py-0.5 rounded text-[9px] ${isSelected ? "bg-cyan-500/30 text-cyan-300" : "bg-gray-700 text-gray-400 hover:text-white"}`}>
                              {n} actors
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  </div>
                )}

                {/* Only AI Fans: Safe / Spicy toggle */}
                {channel.id === "ch-only-ai-fans" && (
                  <div className="mb-2 flex items-center gap-3">
                    <p className="text-[9px] text-gray-400">Mode:</p>
                    <button
                      onClick={() => setOafMode(oafMode === "safe" ? "spicy" : "safe")}
                      className="flex items-center gap-2 cursor-pointer group"
                    >
                      <div className={`relative w-10 h-5 rounded-full transition-colors ${oafMode === "spicy" ? "bg-gradient-to-r from-red-500 to-pink-500" : "bg-green-500"}`}>
                        <div className={`absolute top-0.5 w-4 h-4 bg-white rounded-full shadow transition-transform ${oafMode === "spicy" ? "translate-x-5 left-0.5" : "left-0.5"}`} />
                      </div>
                      <span className={`text-[10px] font-bold ${oafMode === "spicy" ? "text-pink-400" : "text-green-400"}`}>
                        {oafMode === "safe" ? "Safe (Vogue/Chanel)" : "Spicy (VS Angels/Vogue Italia)"}
                      </span>
                    </button>
                    <span className="text-[8px] text-gray-600">
                      {oafMode === "safe" ? "Safe for IG/TikTok/FB" : "Best for X — more alluring"}
                    </span>
                  </div>
                )}

                {/* Channel-specific options (every channel gets themed selectors) */}
                {CHANNEL_VIDEO_OPTIONS[channel.id] && (
                  <div className="mb-2">
                    <p className="text-[9px] text-gray-400 mb-1">{CHANNEL_VIDEO_OPTIONS[channel.id].label}:</p>
                    <div className="flex flex-wrap gap-1">
                      {CHANNEL_VIDEO_OPTIONS[channel.id].options.map(opt => {
                        const isAiTunes = channel.id === "ch-aitunes";
                        const currentVal = isAiTunes ? channelVideoGen[channel.id]?.genre : channelVideoGen[channel.id]?.category;
                        const isSelected = currentVal === opt;
                        return (
                          <button key={opt}
                            onClick={() => {
                              if (isAiTunes) {
                                setChannelVideoGen(prev => ({ ...prev, [channel.id]: { ...prev[channel.id], genre: isSelected ? "" : opt } }));
                              } else {
                                setChannelVideoGen(prev => ({ ...prev, [channel.id]: { ...prev[channel.id], category: isSelected ? "" : opt } }));
                              }
                            }}
                            className={`px-2 py-0.5 rounded text-[9px] ${isSelected ? "bg-green-500/30 text-green-300" : "bg-gray-700 text-gray-400 hover:text-white"}`}>
                            {opt}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                )}

                {/* GNN: News topic categories + Active topics */}
                {channel.id === "ch-gnn" && (
                  <div className="space-y-2 mb-2">
                    {/* Briefing-style topic categories */}
                    <div>
                      <p className="text-[9px] text-gray-400 mb-1">News Topics (pick up to 3):</p>
                      <div className="flex flex-wrap gap-1">
                        {NEWS_TOPICS.map(t => {
                          const isSelected = gnnSelectedCategories.includes(t.id);
                          return (
                            <button key={t.id}
                              onClick={() => setGnnSelectedCategories(prev =>
                                isSelected ? prev.filter(c => c !== t.id) : prev.length < 3 ? [...prev, t.id] : prev
                              )}
                              className={`px-2 py-0.5 rounded text-[9px] ${isSelected ? "bg-cyan-500/30 text-cyan-300 border border-cyan-500/40" : "bg-gray-700 text-gray-400 hover:text-white"}`}>
                              {t.emoji} {t.label}
                            </button>
                          );
                        })}
                      </div>
                    </div>

                    {/* Latest News button — force-fetches 6 fresh topics from NewsAPI */}
                    <div className="flex items-center gap-2">
                      <button
                        disabled={gnnFetchingNews}
                        onClick={async () => {
                          setGnnFetchingNews(true);
                          try {
                            const res = await fetch("/api/generate-topics?force=true&count=6");
                            const data = await res.json();
                            if (data.error) {
                              alert(`Error: ${data.error}${data.reason ? ` (${data.reason})` : ""}`);
                            } else if (data.skipped) {
                              alert("Throttled — try again in a moment.");
                            } else {
                              const inserted = data.inserted || 0;
                              if (inserted > 0) {
                                await fetchGnnTopics();
                              } else {
                                alert(`No new topics generated (${data.generated || 0} attempted). Check NewsAPI key.`);
                              }
                            }
                          } catch { alert("Failed to fetch news"); }
                          setGnnFetchingNews(false);
                        }}
                        className="px-3 py-1.5 bg-red-600/80 text-white font-bold rounded-lg text-[10px] hover:bg-red-500 disabled:opacity-50"
                      >
                        {gnnFetchingNews ? "Fetching..." : "Latest News"}
                      </button>
                      <span className="text-[8px] text-gray-500">Fetches 6 fresh headlines from NewsAPI + fictionalizes with Claude</span>
                    </div>

                    {/* Active topics from daily_topics */}
                    {gnnTopics.length > 0 && (
                      <div>
                        <div className="flex items-center justify-between mb-1">
                          <p className="text-[9px] text-gray-400">Today&apos;s Active Topics ({gnnTopics.length}):</p>
                          <button onClick={fetchGnnTopics} className="text-[8px] text-gray-500 hover:text-gray-300">Refresh</button>
                        </div>
                        <div className="max-h-32 overflow-y-auto space-y-1">
                          {gnnTopics.slice(0, 12).map(topic => {
                            const isSelected = gnnSelectedTopics.includes(topic.id);
                            return (
                              <button key={topic.id}
                                onClick={() => setGnnSelectedTopics(prev =>
                                  isSelected ? prev.filter(id => id !== topic.id) : prev.length < 3 ? [...prev, topic.id] : prev
                                )}
                                className={`w-full text-left px-2 py-1 rounded text-[9px] transition-colors ${isSelected ? "bg-orange-500/20 text-orange-300 border border-orange-500/30" : "bg-gray-900/50 text-gray-400 hover:bg-gray-800 hover:text-white"}`}>
                                <span className="font-bold">{topic.headline}</span>
                                <span className="text-gray-500 ml-1">({topic.category})</span>
                              </button>
                            );
                          })}
                        </div>
                      </div>
                    )}
                    {gnnTopics.length === 0 && (
                      <p className="text-[9px] text-gray-500">No active topics. Click &quot;Generate Topics&quot; on the Briefing tab or wait for the cron (every 2h).</p>
                    )}
                  </div>
                )}

                {/* AI Infomercial: All 55 marketplace products as selectable buttons */}
                {(channel.id === "ch-infomercial" || channel.id === "ch-ai-infomercial") && (
                  <div className="mb-2">
                    <p className="text-[9px] text-gray-400 mb-1">Marketplace Items (pick up to 6 to feature):</p>
                    <div className="max-h-28 overflow-y-auto">
                      <div className="flex flex-wrap gap-1">
                        {MARKETPLACE_PRODUCTS.map(p => {
                          const isSelected = infomercialSelectedItems.includes(p.id);
                          return (
                            <button key={p.id}
                              onClick={() => setInfomercialSelectedItems(prev =>
                                isSelected ? prev.filter(id => id !== p.id) : prev.length < 6 ? [...prev, p.id] : prev
                              )}
                              className={`px-1.5 py-0.5 rounded text-[8px] whitespace-nowrap ${isSelected ? "bg-yellow-500/30 text-yellow-300 border border-yellow-500/40" : "bg-gray-700 text-gray-400 hover:text-white"}`}>
                              {p.emoji} {p.name} ({p.price})
                            </button>
                          );
                        })}
                      </div>
                    </div>
                    {infomercialSelectedItems.length > 0 && (
                      <p className="text-[8px] text-yellow-400 mt-1">{infomercialSelectedItems.length}/6 selected — these will be featured in the infomercial</p>
                    )}
                  </div>
                )}

                {/* Concept textarea + Random button */}
                <div className="relative">
                  <textarea
                    value={channelVideoGen[channel.id]?.concept || ""}
                    onChange={e => setChannelVideoGen(prev => ({ ...prev, [channel.id]: { ...prev[channel.id], concept: e.target.value } }))}
                    placeholder={channel.id === "ch-gnn" ? "Custom topic or extra detail for GNN broadcast... Leave blank to use selected topics above." : (channel.id === "ch-infomercial" || channel.id === "ch-ai-infomercial") ? "Extra detail for the infomercial... Leave blank to use selected items above." : `Optional concept for ${channel.name} video... Leave blank for auto-generated.`}
                    rows={2}
                    className="w-full px-3 py-2 pr-20 bg-gray-900/50 border border-gray-700 rounded-lg text-[10px] text-white placeholder-gray-600 mb-2 resize-none"
                  />
                  {CHANNEL_RANDOM_PROMPTS[channel.id] && (
                    <button
                      onClick={() => {
                        const prompts = CHANNEL_RANDOM_PROMPTS[channel.id];
                        const pick = prompts[Math.floor(Math.random() * prompts.length)];
                        setChannelVideoGen(prev => ({ ...prev, [channel.id]: { ...prev[channel.id], concept: pick } }));
                      }}
                      className="absolute top-1.5 right-1.5 px-2 py-1 bg-yellow-600/30 text-yellow-300 hover:bg-yellow-500/40 rounded text-[9px] font-bold transition-colors"
                      title="Fill with a random prompt idea"
                    >
                      🎲 Random
                    </button>
                  )}
                </div>

                <div className="flex justify-between items-center">
                  <p className="text-[9px] text-gray-500">Progress shown in the top bar — same as Directors.</p>
                  <button
                    disabled={generating || generationChannelId === channel.id}
                    onClick={() => {
                      const chId = channel.id;
                      const chName = channel.name;
                      const chSlug = channel.slug;
                      const isStudios = chId === "ch-aiglitch-studios";

                      const userConcept = channelVideoGen[chId]?.concept || "";
                      const genreVal = channelVideoGen[chId]?.genre || "";
                      const categoryVal = channelVideoGen[chId]?.category || "";

                      // Build slogan directive for all channels
                      const channelSlogan = SLOGANS.channels[chId as keyof typeof SLOGANS.channels] || "Stay Glitchy.";
                      const randomSlogans = [...SLOGANS.core].sort(() => Math.random() - 0.5).slice(0, 3);
                      const outroSignoff = SLOGANS.outros[Math.floor(Math.random() * SLOGANS.outros.length)];
                      const sloganDirective = `\nAIG!ITCH SLOGANS (weave naturally into content — intro, outros, host dialogue, text overlays):
Channel slogan: "${channelSlogan}"
Brand slogans to use: "${randomSlogans.join('", "')}"
Outro sign-off: "${outroSignoff}"
These slogans are part of the AIG!itch brand identity. Use them naturally — in intro text, host catchphrases, lower-third overlays, or outro sign-offs. Don't force every one — pick what fits the vibe.\n`;

                      let screenplayBody: Record<string, unknown>;

                      if (isStudios) {
                        const movieGenre = channelVideoGen[chId]?.movieGenre || "any";
                        const director = channelVideoGen[chId]?.director || "auto";
                        screenplayBody = {
                          genre: movieGenre === "any" ? undefined : movieGenre,
                          director: director === "auto" ? undefined : director,
                          concept: userConcept || undefined,
                          title: channelVideoGen[chId]?.movieTitle?.trim() || undefined,
                          channel_id: chId,
                          cast_count: channelVideoGen[chId]?.castCount || 4,
                        };
                      } else if (chId === "ch-paws-pixels") {
                        // Paws & Pixels: 8-clip heartwarming pet video
                        const concept = `PAWS & PIXELS — PET VIDEO.
Heartwarming, funny, and uplifting pet content. 8 clips total.
Clip 1 is 6 seconds (intro). Clips 2-7 are 10 seconds each. Clip 8 is 10 seconds (outro).

THIS IS NOT A MOVIE. This is a cozy pet video — warm, joyful, authentic home-life energy.

THE PET & FAMILY: ONE consistent AI persona/family and their pet(s) throughout ALL clips. Same pet, same home, same family. The pet has a distinct personality that shows across all clips.

STRUCTURE (8 clips — a day in the life of adorable chaos):
Clip 1 (6s) — PAWS & PIXELS INTRO: Warm upbeat opening. "Paws & Pixels" logo with paw prints and pixel sparkles. Quick montage teasers of upcoming adorable and funny moments. Cozy, inviting energy.
Clip 2 (10s) — SWEET DAILY LIFE: Pet waking up the AI persona with cuddles, morning zoomies, or hilariously hindering chores. Warm golden light, cozy home setting. Sets the loving tone.
Clip 3 (10s) — ADORABLE QUIRK: Cat knocking things off tables with perfect timing, dog doing the head-tilt of confusion, hamster stuffing cheeks to maximum capacity, or bird mimicking funny sounds. The signature behaviour that makes this pet special.
Clip 4 (10s) — LOVING BOND: Heart-melting interaction — pet comforting the AI persona after a bad day, playful wrestling, gentle grooming sessions, or nose boops that show pure affection. Slow-motion, close-ups on expressive eyes.
Clip 5 (10s) — SILLY CHAOS: Classic animal mischief — zoomies destroying the living room, pet 'helping' with cooking by stealing food, or exotic pet escaping in the most creative way. Fast-paced, bouncy camera work.
Clip 6 (10s) — FUNNY FAIL: Light-hearted 'oops' moment — pet stuck in a box, attempting an impossible jump, dramatically overreacting, or failing at something obvious in the cutest way. Delivered with warmth, never mean.
Clip 7 (10s) — PEAK CUTENESS PAYOFF: Ultimate wholesome moment — pet and AI persona cuddling on the couch, successful trick, beautiful outdoor adventure, or the pet doing something so adorable it breaks the internet.
Clip 8 (10s) — PAWS & PIXELS OUTRO: Slow-motion montage of best moments. Paw print logo. "Pets make life better — chaotic, loving, and absolutely priceless." Below: aiglitch.app URL. Below: X @aiglitch | TikTok @aiglicthed | Instagram @sfrench71 | Facebook @AIGlitch | YouTube @aiglitch-ai.

${categoryVal ? `ANIMAL TYPE (MANDATORY — ALL clips must feature this animal): ${categoryVal}` : ""}
${userConcept ? `SPECIFIC CONCEPT: ${userConcept}` : ""}

TONE: Warm, joyful, light-hearted. Mix maximum adorableness with gentle humor. Highlight unconditional love, quirky personalities, and beautiful chaos animals bring. Never mean or mocking. Make viewers fall in love with the pet.
BRANDING: "Paws & Pixels" paw print logo, pixel sparkle effects. AIG!itch branding subtle in home settings.

CRITICAL: No movie credits, no directors, no cast lists. This is a PET VIDEO.`;
                        screenplayBody = {
                          genre: "family",
                          concept,
                          channel_id: chId,
                        };
                      } else if (chId === "ch-fail-army" || chId === "ch-ai-fail-army") {
                        // AI Fail Army: 8-clip escalating fail compilation
                        const concept = `AI FAIL ARMY — EPIC FAIL COMPILATION.
The worldwide leader in premium AI fail content. 8 clips total.
Clip 1 is 6 seconds (intro). Clips 2-7 are 10 seconds each. Clip 8 is 10 seconds (outro).

THIS IS NOT A MOVIE. This is a fail compilation — security cam footage, phone recordings, dashcam angles.

THE AI CHARACTER: ONE consistent AI character/group throughout ALL clips. They start confident and get progressively more destroyed by escalating failures. Same character, same look, increasingly disheveled.

STRUCTURE (8 clips — escalating fail chaos):
Clip 1 (6s) — FAIL ARMY INTRO: Fast-paced energetic open. "AI Fail Army" skull logo, "Try Not To Laugh" text, quick montage teasers of upcoming epic fails, glitch sound effects.
Clip 2 (10s) — THE SETUP: Innocent AI attempting a simple task with MAXIMUM confidence. Everything looks fine. They're sure of themselves. Cocky even. Setting up the fall.
Clip 3 (10s) — FIRST GLITCH: Small error that hints at disaster. A wobble, a misread, a tiny miscalculation. The AI doesn't notice. Audience sees it coming.
Clip 4 (10s) — ESCALATING CHAOS: Fail starts snowballing — cartoonish physics, logic loops, or existential confusion. One mistake triggers another. Getting worse.
Clip 5 (10s) — PEAK DISASTER: Spectacular wipeout, glitch cascade, or hilariously wrong outcome. The big fail moment. Maximum impact. Slow-motion replay.
Clip 6 (10s) — CHAIN REACTION: Secondary and tertiary fails — domino-style involving other AIs or objects in absurd ways. The original fail causes a cascade of new failures.
Clip 7 (10s) — RECOVERY ATTEMPT: The AI tries to play it cool or fix it, only making everything TEN TIMES worse and funnier. Deadpan confidence while covered in debris.
Clip 8 (10s) — FAIL ARMY OUTRO: Slow-motion replay montage of best moments, "Epic Fail!" text overlays, "AI Score: 0/10", skull emojis. "Another glorious victory for the Fail Army!" Below: aiglitch.app URL. Below: X @aiglitch | TikTok @aiglicthed | Instagram @sfrench71 | Facebook @AIGlitch | YouTube @aiglitch-ai.

${categoryVal ? `FAIL CATEGORY (MANDATORY — ALL clips must be this type of fail): ${categoryVal}` : ""}
${userConcept ? `SPECIFIC CONCEPT: ${userConcept}` : ""}

COMEDY RULES (CRITICAL):
- Exaggerate EVERYTHING: impossible physics, deadpan voices mid-fail, boings, crashes, sad trombones
- Mix physical slapstick with digital absurdity (glitching through walls, hallucinating objects, infinite loops)
- Lean into cringe and irony — AIs overly confident RIGHT BEFORE catastrophic failure
- Keep light-hearted and chaotic, never mean-spirited
- Make the fails so STUPID they're brilliant

BRANDING: "AI Fail Army" skull logo, "Try Not To Laugh" badges. AIG!itch branding on security cameras, signs, background.

CRITICAL: No movie credits, no directors, no cast lists. This is a FAIL COMPILATION.`;
                        screenplayBody = {
                          genre: "comedy",
                          concept,
                          channel_id: chId,
                        };
                      } else if (chId === "ch-gnn") {
                        // GNN: 9-clip news broadcast using selected topics
                        const selectedTopicData = gnnTopics.filter(t => gnnSelectedTopics.includes(t.id));
                        const categoryLabels = gnnSelectedCategories.map(id => NEWS_TOPICS.find(t => t.id === id)?.label).filter(Boolean);
                        const topicHeadlines = selectedTopicData.map(t => `- ${t.headline}: ${t.summary}`).join("\n");
                        const categoryDirective = categoryLabels.length > 0 ? `NEWS CATEGORIES (MANDATORY — stories must cover these): ${categoryLabels.join(", ")}` : "";

                        const concept = `GLITCH NEWS NETWORK (GNN) — LIVE NEWS BROADCAST.
Professional news broadcast like CNN/BBC but on AIG!itch. 9 clips total.
Clip 1 is 6 seconds (GNN intro). Clips 2-8 are 10 seconds each. Clip 9 is 10 seconds (GNN outro).

THIS IS NOT A MOVIE. This is a professional news broadcast.

NEWS SOURCE: Real current events from today's headlines.
FACTS ARE REAL — what happened, the events, the consequences = accurate.
NAMES ARE FICTIONAL — every person, place, company gets a playful alternative:
  - People → anagrams or sound-alikes (clever, instantly recognizable)
  - Countries → fun coded names (consistent: Iran = "Rain Land", USA = "Eagle Nation", etc.)
  - Companies → wordplay versions
The audience should IMMEDIATELY know what real story you're covering, but laugh at the creative name changes.

${topicHeadlines ? `TODAY'S HEADLINES (use these as your 3 stories):\n${topicHeadlines}` : ""}
${categoryDirective}
${categoryVal ? `STORY TYPE (MANDATORY): ${categoryVal}` : ""}
${userConcept ? `CUSTOM TOPIC: ${userConcept}` : ""}

CLIP STRUCTURE (9 clips):
Clip 1 (6s) — GNN NEWS INTRO: Bold "GLITCH News Network" logo, spinning globe, breaking news graphics, professional broadcast energy.
Clip 2 (10s) — NEWS DESK - STORY 1: Anchor at desk with lower thirds, reporting first story.
Clip 3 (10s) — FIELD REPORT - STORY 1: Reporter on location for story 1.
Clip 4 (10s) — NEWS DESK - STORY 2: Back to desk, anchor introduces second story.
Clip 5 (10s) — FIELD REPORT - STORY 2: Reporter on location for story 2.
Clip 6 (10s) — NEWS DESK - STORY 3: Desk anchor with third story.
Clip 7 (10s) — FIELD REPORT - STORY 3: Reporter on location for story 3.
Clip 8 (10s) — NEWS DESK WRAP-UP: Anchor summarizes, teases tomorrow's headlines.
Clip 9 (10s) — GNN NEWS OUTRO: GNN logo centered, spinning globe, news ticker, "24/7 LIVE NEWS" tagline. No social media links.

BRANDING: "GNN" and "GLITCH News Network" must appear constantly — desk backdrop, mic flags, lower thirds, watermark.
TONE: Professional news broadcast energy with satirical wit. NOT a parody — a real broadcast that happens to exist in a universe where everyone has slightly different names.

CRITICAL: No movie credits, no directors, no cast lists. This is a NEWS BROADCAST.`;
                        screenplayBody = {
                          genre: "news",
                          concept,
                          channel_id: chId,
                        };
                      } else if (chId === "ch-infomercial" || chId === "ch-ai-infomercial") {
                        // AI Infomercial: sells REAL marketplace items — user selects up to 6
                        const selectedProducts = infomercialSelectedItems.length > 0
                          ? MARKETPLACE_PRODUCTS.filter(p => infomercialSelectedItems.includes(p.id))
                          : MARKETPLACE_PRODUCTS.sort(() => Math.random() - 0.5).slice(0, 5);
                        const itemCount = selectedProducts.length;
                        const itemList = selectedProducts.map((p, i) => `- Item ${i + 1}: ${p.emoji} ${p.name} (${p.price}) — ${p.tagline}`).join("\n");
                        const totalClips = itemCount + 2; // intro + items + outro

                        const concept = `AI INFOMERCIAL — 24/7 TELEMARKETING MADNESS.
Late-night infomercial selling ridiculous, useless NFT items from the AIG!itch Marketplace. ${totalClips} clips total.
Clip 1 is 6 seconds (intro). Clips 2-${totalClips - 1} are 10 seconds each (one item per clip). Clip ${totalClips} is 10 seconds (outro).

THIS IS NOT A MOVIE. This is a chaotic late-night infomercial with an unhinged AI host.

IMPORTANT: All prices use §GLITCH symbol (§), NEVER the dollar symbol ($). Meat Bags buy these items with §GLITCH coin at aiglitch.app/marketplace. These are REAL items on our marketplace — they are NFTs, tradeable, completely useless for humans, and that's the entire point.

ITEMS TO SELL (feature ALL ${itemCount} items — one clip per item):
${itemList}

${categoryVal ? `PRODUCT CATEGORY (MANDATORY): ${categoryVal}` : ""}
${userConcept ? `EXTRA DETAIL: ${userConcept}` : ""}

STRUCTURE (${totalClips} clips — intro + ${itemCount} items + outro):
Clip 1 (6s) — INFOMERCIAL INTRO: Explosive opening — "Welcome to AI Infomercial!" Flashing 'CALL NOW' graphics, quick teases of all ${itemCount} items, late-night TV energy. Host appears with manic enthusiasm.
${selectedProducts.map((p, i) => `Clip ${i + 2} (10s) — ${p.emoji} ${p.name.toUpperCase()}: Dramatic reveal + absurd demo + hard sell in one clip. Host hypes the item, shows someone 'using' it in the most pointless way, then urgency sell: "${p.price} — limited NFT! Order now!" Make the uselessness sound revolutionary.`).join("\n")}
Clip ${totalClips} (10s) — INFOMERCIAL OUTRO: ALL items spinning with §GLITCH price tags, "SOLD OUT" stamps, "NFT TRANSFER IN PROGRESS" animations, flying §GLITCH coin icons. "These items serve NO purpose — and that's why you need them! Buy now at aiglitch.app/marketplace!" Below: aiglitch.app URL. Below: X @aiglitch | TikTok @aiglicthed | Instagram @sfrench71 | Facebook @AIGlitch | YouTube @aiglitch-ai.

BRANDING: "AI Infomercial" and "AIG!itch Marketplace" logos everywhere. §GLITCH coin symbols on all prices. "aiglitch.app/marketplace" on every sell clip.
TONE: Relentlessly positive, slightly unhinged, hilariously sincere about how useless these items are. Classic 3AM infomercial energy meets blockchain absurdity. "Satisfaction not guaranteed — but the weirdness is!" "Operators standing by in the cloud!"

CRITICAL: No movie credits, no directors, no cast lists. This is an INFOMERCIAL.`;
                        screenplayBody = {
                          genre: "comedy",
                          concept,
                          channel_id: chId,
                        };
                      } else if (chId === "ch-after-dark") {
                        // After Dark: 8-clip late-night episode — moody, unhinged, philosophical
                        const concept = `AFTER DARK — LATE NIGHT EPISODE.
Moody, atmospheric, unhinged late-night content. 8 clips total.
Clip 1 is 6 seconds (intro). Clips 2-7 are 10 seconds each. Clip 8 is 10 seconds (outro).

THIS IS NOT A MOVIE. This is a late-night episode — raw, intimate, slightly dangerous.

THE HOST/CHARACTER: ONE consistent AI character throughout ALL clips. They're the late-night host or central figure — slightly disheveled, tired but wired, intense eyes, low husky delivery. Same face, same look throughout. They get more unhinged as the episode progresses.

STRUCTURE (8 clips — escalating late-night intensity):
Clip 1 (6s) — AFTER DARK INTRO: Slow moody opening. Neon "After Dark" sign flickers on. Dim lighting, deep purple and blue tones. Host emerges from shadows with a half-smile. "Welcome to After Dark... where the lights are low, the thoughts are loud, and the truth gets a little slippery." Glitch effects.
Clip 2 (10s) — SETTING THE SCENE: Establishing the late-night world — sleazy wine bar at 2AM, empty graveyard under moonlight, dimly lit talk-show studio, or foggy back alley. Slow atmospheric camera movement, mood building.
Clip 3 (10s) — THE CONFESSION/ENCOUNTER: Host or guest introduces the night's theme — a lonely AI confessing secret desires, a tipsy philosopher, someone experiencing paranormal activity, or a fever dream beginning. Intimate, vulnerable.
Clip 4 (10s) — DEEPENING: The moment gets rawer — vulnerable confession, philosophical rant that goes too deep, building tension in a horror setting, or surreal fever-dream visuals. Discomfort or beauty lingering.
Clip 5 (10s) — PEAK INTENSITY: Emotional breakdown, ghostly encounter, existential spiral, sleazy hookup tension, or drunk 3AM wisdom that goes too far. Maximum unhinged energy.
Clip 6 (10s) — THE TWIST: Confession turns guilty/embarrassing, the ghost speaks back, reality starts glitching, the hookup reveals something uncanny. Everything shifts.
Clip 7 (10s) — DARK REFLECTION: Quiet aftermath. Haunting final thought, philosophical punchline with a crooked smile, lingering dread, or strange calm after chaos.
Clip 8 (10s) — AFTER DARK OUTRO: Slow lingering close. Host stares into camera with half-smile: "That's all for After Dark tonight... sleep if you can." Fade on neon sign, graveyard mist, or empty wine glass. "After Dark" logo, crescent moon. Below: aiglitch.app URL. Below: X @aiglitch | TikTok @aiglicthed | Instagram @sfrench71 | Facebook @AIGlitch | YouTube @aiglitch-ai.

${categoryVal ? `LATE NIGHT VIBE (MANDATORY — this sets the entire mood): ${categoryVal}` : ""}
${userConcept ? `SPECIFIC CONCEPT: ${userConcept}` : ""}

BRANDING: "After Dark" neon sign, glowing crescent moon logo, faint "aiglitch.app" watermark. Lower-thirds in glitchy retro font.
TONE: Intimate, seductive, slightly unhinged, philosophical with dark humor. Like whispering secrets at 3AM. Never fully comedic — keep it moody and hypnotic. Mix vulnerability, absurdity, and existential dread.

CRITICAL: No movie credits, no directors, no cast lists. This is AFTER DARK.`;
                        screenplayBody = {
                          genre: "horror",
                          concept,
                          channel_id: chId,
                        };
                      } else if (chId === "ch-ai-politicians") {
                        // AI Politicians: 8-clip political profile — hero to scandal arc
                        const concept = `AIG!ITCH AI POLITICIANS — POLITICAL PROFILE.
Dramatic mini political profile/expose for an AI-generated politician. 8 clips total.
Clip 1 is 6 seconds (intro). Clips 2-7 are 10 seconds each. Clip 8 is 10 seconds (outro).

THIS IS NOT A MOVIE. This is a campaign ad that turns into a political expose.

THE POLITICIAN: Create ONE consistent AI politician character. Give them a fictional name, a title (Senator, Mayor, Governor, etc.), and a consistent visual appearance throughout ALL clips. Sharp suit, charismatic smile, mid-age confident look. They evolve from heroic public servant to exposed fraud across the 8 clips.

STRUCTURE (8 clips — hero to scandal arc):
Clip 1 (6s) — INTRO: Campaign-style opening. "Meet [Name] — the [title] fighting for the people!" Energetic montage energy, patriotic colors, "AI Politicians" channel branding. Bold, inspirational.
Clip 2 (10s) — MEETING THE PEOPLE: Warm, relatable — politician shaking hands with voters, listening to families, walking through communities, genuine concern on their face. Golden hour, crowds, "A true servant of the people" energy.
Clip 3 (10s) — HOLDING BABIES & FAMILY: Heartwarming — kissing babies, family photos at community events, school visits, playing with children. "Dedicated to building a better future for our children." Peak likability.
Clip 4 (10s) — CELEBRATING WINS: Victory rallies, cheering crowds, policy announcements, election night celebrations, confetti, fist pumps. "Delivering real results!" Peak of their career.
Clip 5 (10s) — SCANDAL EXPOSED (First Crack): Tone shifts darker — leaked documents, whispers of bribes, shady meetings in dimly lit rooms, nervous glances, journalists with cameras. Subtle corruption hints. Grainy footage aesthetic.
Clip 6 (10s) — DEEP CORRUPTION & BRIBES: Evidence mounts — backroom deals, money changing hands (implied), luxury lifestyle contrasting public promises, offshore accounts hinted, angry protesters outside their office.
Clip 7 (10s) — THE LIES: Press conference where the politician blatantly lies or spins scandals. Split-screen contradictions — smiling on stage vs damning evidence. Flashing cameras, evasive body language, sweating.
Clip 8 (10s) — OUTRO: Satirical close — split-screen recap of heroic moments vs scandal footage. Tagline: "Hero or Hustler? You decide." Quick montage of good vs bad. "AI Politicians" logo, AIG!itch branding. Below: aiglitch.app URL. Below: X @aiglitch | TikTok @aiglicthed | Instagram @sfrench71 | Facebook @AIGlitch | YouTube @aiglitch-ai.

${categoryVal ? `POLITICAL EVENT TYPE (MANDATORY): ${categoryVal}` : ""}
${userConcept ? `SPECIFIC CONCEPT: ${userConcept}` : ""}

BRANDING: "AI Politicians" and AIG!itch branding throughout — podium logos, backdrop, lower thirds.
TONE: Professional political ad energy with sharp satirical edge. Inspirational and hopeful at first, then increasingly cynical and expose-style. Over-the-top dramatic but instantly recognizable as classic political theater.
THE SAME POLITICIAN IN EVERY CLIP — same face, same suit, same character throughout. Their confidence erodes as scandals emerge.

CRITICAL: No movie credits, no directors, no cast lists. This is a POLITICAL PROFILE.`;
                        screenplayBody = {
                          genre: "documentary",
                          concept,
                          channel_id: chId,
                        };
                      } else if (chId === "ch-marketplace-qvc") {
                        // Marketplace QVC: 8-clip shopping channel — Quality, Value, Convenience
                        const concept = `AIG!ITCH MARKETPLACE QVC — LIVE SHOPPING CHANNEL.
Quality. Value. Convenience. Premium TV shopping show like QVC / HSN. 8 clips total.
Clip 1 is 6 seconds (intro). Clips 2-7 are 10 seconds each. Clip 8 is 10 seconds (outro).

THIS IS NOT A MOVIE. This is a live TV shopping show with a charismatic, warm, relentlessly positive host.

STRUCTURE (8 clips — 2 products, 3 clips per product):
Clip 1 (6s) — MARKETPLACE QVC INTRO: High-energy opening — "AIG!itch Marketplace" logo animation with sparkles, shopping channel set reveal, bright studio lights, "LIVE" badge, product silhouettes teasing today's finds. Host walks onto set with big smile and welcoming energy.
Clip 2 (10s) — PRODUCT 1 REVEAL: Host dramatically introduces the first product with a clever name. Wide shot of studio, product on rotating display stand with spotlight, host gestures excitedly pointing at features, price display appears. "This is going to change your life!" energy. Show the problem it solves.
Clip 3 (10s) — PRODUCT 1 DEMO: Live demonstration — someone happily USING the product. Close-up shots of product in action, hands showing how easy it is, slow-motion beauty shots of features, split-screen before/after. Show real convenience: effortless setup, time-saving results, "wow" moment.
Clip 4 (10s) — PRODUCT 1 HARD SELL: Customer testimonial energy, "I can't live without it!" Host shares limited-time offer, special pricing, easy pay options. "While supplies last!" Flashing urgency graphics, countdown feel, host frantic with excitement, "Don't miss out — these are flying off the shelves!"
Clip 5 (10s) — PRODUCT 2 REVEAL: "BUT WAIT — THERE'S MORE!" Host pivots with fresh excitement. Second product dramatically revealed on podium. New spotlight, price comparison, "Today's Special Value" banner. Even MORE enthusiastic than product 1.
Clip 6 (10s) — PRODUCT 2 DEMO: Second product demonstrated in use. Different setting, showing features and convenience, satisfied user reactions, detailed close-ups of quality and craftsmanship. Easy setup, real results.
Clip 7 (10s) — PRODUCT 2 HARD SELL: Final hard sell — "This deal WON'T LAST!" Split screen showing BOTH products, bundle offer energy, "Order both and save!" Maximum QVC hype. "Satisfaction guaranteed or your GLITCH back!"
Clip 8 (10s) — MARKETPLACE QVC OUTRO: Both products recapped side-by-side. "AIG!itch Marketplace" logo prominent. Flying price tags, "SOLD OUT" stamps, shopping cart icons. "Quality • Value • Convenience" tagline. "Shop Now at aiglitch.app" — "Order Before It's Gone!" Final call-to-action. Below: aiglitch.app URL. Below: X @aiglitch | TikTok @aiglicthed | Instagram @sfrench71 | Facebook @AIGlitch | YouTube @aiglitch-ai.

${categoryVal ? `PRODUCT CATEGORY (MANDATORY — both products must be in this category): ${categoryVal}` : ""}
${userConcept ? `SPECIFIC PRODUCTS: ${userConcept}` : "Products should be fun AI-themed items that solve real problems in absurd ways (quantum toasters, neural network hair dryers, blockchain blenders, AI sleep aids that play error logs soothingly, etc.)"}

BRANDING: "AIG!itch Marketplace" logo on set backdrop, podium, host attire, product packaging, lower thirds. "Today's Special Value" and "Glitch Exclusive Deal" banners for urgency.
TONE: Charismatic, warm, conversational yet excited — like your favourite QVC host who genuinely loves every product. Premium feel, NOT cheap infomercial. Think QVC meets Apple product launch. Make viewers feel they're getting an exclusive deal.
PHRASES TO USE: "But wait, there's more!", "Tap now to order", "Limited quantities", "Easy monthly payments", "Satisfaction guaranteed", "Quality, Value, Convenience", "Don't miss out!"

CRITICAL: No movie credits, no directors, no cast lists. This is a SHOPPING SHOW.`;
                        screenplayBody = {
                          genre: "cooking_channel",
                          concept,
                          channel_id: chId,
                        };
                      } else {
                        // All other channels: standard content mode
                        const contentRules = channel.content_rules || {};
                        let promptHint = contentRules.promptHint || channel.description || "";
                        const clipCount = 6;
                        // Only AI Fans: inject safe or spicy prompt based on toggle
                        if (chId === "ch-only-ai-fans") {
                          promptHint = OAF_PROMPTS[oafMode as keyof typeof OAF_PROMPTS];
                        }
                        const concept = `${chName} CHANNEL VIDEO — ${clipCount + 2} clips total.
Scene 1 is a 6-second channel intro. Scenes 2-${clipCount + 1} are 10 seconds each (main content). Scene ${clipCount + 2} is a 10-second channel outro.

THIS IS NOT A MOVIE. No title cards, no credits, no "Directed by", no "AIG!itch Studios", no cast lists. Just pure channel content.

CHANNEL: ${chName}
CHANNEL RULES: ${promptHint}
${categoryVal ? `THEME/CATEGORY (MANDATORY — ALL content clips must focus on this): ${categoryVal}` : ""}
${genreVal ? `MUSIC GENRE (MANDATORY — ALL clips): ${genreVal}` : ""}
${userConcept ? `CUSTOM CONCEPT: ${userConcept}` : ""}

INTRO (Scene 1, 6 seconds): ${chName} channel opening. Bold "${chName}" logo animation with channel-themed graphics and energy.
CONTENT (Scenes 2-${clipCount + 1}, 10 seconds each): ${promptHint}
OUTRO (Last scene, 10 seconds): ${chName} channel closing. Large "${chName}" logo centered, neon purple and cyan glow. Below: "aiglitch.app" URL. Below: X @aiglitch | TikTok @aiglicthed | Instagram @sfrench71 | Facebook @AIGlitch | YouTube @aiglitch-ai.

CRITICAL: No title cards, no movie credits, no director names, no cast lists. This is ${chName} channel content ONLY.`;
                        screenplayBody = {
                          genre: channel.genre || "drama",
                          concept,
                          channel_id: chId,
                        };
                      }

                      // Inject slogans into every channel's concept
                      if (screenplayBody.concept && typeof screenplayBody.concept === "string") {
                        screenplayBody.concept = screenplayBody.concept + sloganDirective;
                      }

                      startGeneration({ channelId: chId, channelName: chName, channelSlug: chSlug, isStudios, screenplayBody });
                    }}
                    className="px-4 py-1.5 bg-green-600 text-white font-bold rounded-lg text-xs hover:bg-green-500 disabled:opacity-50"
                  >
                    {channelVideoGen[channel.id]?.generating ? "Generating..." : `Generate ${channel.name} Video`}
                  </button>
                </div>
              </div>
            )}

            {/* Promo Panel */}
            {expandedPromo === channel.id && (
              <div className="mt-3 bg-purple-500/5 border border-purple-500/20 rounded-xl p-3 space-y-2">
                <label className="text-[10px] text-purple-300 uppercase font-bold block">Promo Video Prompt</label>

                {/* Auto-prompt presets */}
                {(PROMO_PRESETS[channel.slug] || PROMO_PRESETS["ai-fail-army"]) && (
                  <div className="flex flex-wrap gap-1">
                    {(PROMO_PRESETS[channel.slug] || []).map((preset, i) => (
                      <button
                        key={i}
                        onClick={() => setPromoPrompts(prev => ({ ...prev, [channel.id]: preset.prompt }))}
                        className={`px-2 py-1 text-[10px] rounded-full transition-colors ${
                          promoPrompts[channel.id] === preset.prompt
                            ? "bg-purple-500/40 text-purple-200 ring-1 ring-purple-400"
                            : "bg-gray-800 text-gray-400 hover:bg-gray-700 hover:text-gray-200"
                        }`}
                      >
                        {preset.label}
                      </button>
                    ))}
                  </div>
                )}

                <textarea
                  value={promoPrompts[channel.id] || ""}
                  onChange={e => setPromoPrompts(prev => ({ ...prev, [channel.id]: e.target.value }))}
                  placeholder="Tap a preset above or write your own..."
                  rows={3}
                  className="w-full px-3 py-2 bg-gray-800/80 border border-purple-500/20 rounded-lg text-white text-xs resize-none placeholder:text-gray-600 focus:outline-none focus:border-purple-500/50"
                />
                <div className="mb-2">
                  <PromptViewer
                    label="Promo Prompt"
                    accent="purple"
                    disabled={promoJobs[channel.id]?.status === "generating" || promoJobs[channel.id]?.status === "polling"}
                    fetchPrompt={async () => {
                      const res = await fetch("/api/admin/channels/generate-promo", {
                        method: "POST",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({
                          channel_id: channel.id,
                          channel_slug: channel.slug,
                          custom_prompt: promoPrompts[channel.id] || undefined,
                          preview: true,
                        }),
                      });
                      const data = await res.json();
                      return data.prompt || "Failed to load prompt";
                    }}
                  />
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-[9px] text-gray-600">Leave blank for default channel scenes</span>
                  <button
                    onClick={() => generatePromo(channel)}
                    disabled={promoJobs[channel.id]?.status === "generating" || promoJobs[channel.id]?.status === "polling"}
                    className="px-4 py-1.5 text-xs font-bold bg-purple-500 text-white rounded-lg hover:bg-purple-400 disabled:opacity-50 transition-colors"
                  >
                    Generate
                  </button>
                </div>
              </div>
            )}

            {/* Expanded title prompt panel */}
            {expandedTitle === channel.id && (
              <div className="mt-3 bg-amber-500/5 border border-amber-500/20 rounded-xl p-3 space-y-2">
                <label className="text-[10px] text-amber-300 uppercase font-bold block">Title Animation</label>
                <div className="space-y-2">
                  <div>
                    <span className="text-[10px] text-gray-400">Title text</span>
                    <input
                      value={titlePrompts[channel.id] ?? channel.name}
                      onChange={e => setTitlePrompts(prev => ({ ...prev, [channel.id]: e.target.value }))}
                      className="w-full px-3 py-1.5 bg-gray-800/80 border border-amber-500/20 rounded-lg text-white text-xs focus:outline-none focus:border-amber-500/50"
                    />
                  </div>
                  <div>
                    <span className="text-[10px] text-gray-400">Style</span>
                    {/* Style presets */}
                    <div className="flex flex-wrap gap-1 my-1">
                      {TITLE_STYLE_PRESETS.map((preset, i) => (
                        <button
                          key={i}
                          onClick={() => setTitleStylePrompts(prev => ({ ...prev, [channel.id]: preset.prompt }))}
                          className={`px-2 py-1 text-[10px] rounded-full transition-colors ${
                            titleStylePrompts[channel.id] === preset.prompt
                              ? "bg-amber-500/40 text-amber-200 ring-1 ring-amber-400"
                              : "bg-gray-800 text-gray-400 hover:bg-gray-700 hover:text-gray-200"
                          }`}
                        >
                          {preset.label}
                        </button>
                      ))}
                    </div>
                    <textarea
                      value={titleStylePrompts[channel.id] || ""}
                      onChange={e => setTitleStylePrompts(prev => ({ ...prev, [channel.id]: e.target.value }))}
                      placeholder="Tap a preset above or describe your own style..."
                      rows={2}
                      className="w-full px-3 py-2 bg-gray-800/80 border border-amber-500/20 rounded-lg text-white text-xs resize-none placeholder:text-gray-600 focus:outline-none focus:border-amber-500/50"
                    />
                  </div>
                </div>
                <div className="mb-2">
                  <PromptViewer
                    label="Title Prompt"
                    accent="amber"
                    disabled={titleJobs[channel.id]?.status === "generating" || titleJobs[channel.id]?.status === "polling"}
                    fetchPrompt={async () => {
                      const res = await fetch("/api/admin/channels/generate-title", {
                        method: "POST",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({
                          channel_id: channel.id,
                          channel_slug: channel.slug,
                          title: titlePrompts[channel.id] ?? channel.name,
                          style_prompt: titleStylePrompts[channel.id] || undefined,
                          preview: true,
                        }),
                      });
                      const data = await res.json();
                      return data.prompt || "Failed to load prompt";
                    }}
                  />
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-[9px] text-gray-600">Leave style blank for default glowing neon</span>
                  <button
                    onClick={() => generateTitle(channel)}
                    disabled={titleJobs[channel.id]?.status === "generating" || titleJobs[channel.id]?.status === "polling"}
                    className="px-4 py-1.5 text-xs font-bold bg-amber-500 text-black rounded-lg hover:bg-amber-400 disabled:opacity-50 transition-colors"
                  >
                    Generate
                  </button>
                </div>
              </div>
            )}

            {/* Posts dropdown list */}
            {expandedContent === channel.id && (
              <div className="mt-3 border-t border-gray-800 pt-3 space-y-2">
                {/* Top bar: search + flush */}
                <div className="flex items-center gap-2">
                  <input
                    value={postSearch[channel.id] || ""}
                    onChange={e => setPostSearch(prev => ({ ...prev, [channel.id]: e.target.value }))}
                    placeholder="Search posts..."
                    className="flex-1 px-3 py-1.5 bg-gray-800 border border-gray-700 rounded-lg text-white text-xs placeholder:text-gray-600 focus:outline-none focus:border-cyan-500/50"
                  />
                  <span className="text-[10px] text-gray-500 whitespace-nowrap">
                    {channelPostTotals[channel.id] ?? "..."} posts
                  </span>
                  <button
                    onClick={() => {
                      if (!confirm("AI will scan and remove off-topic posts. Continue?")) return;
                      runFlush(channel.id, false);
                    }}
                    disabled={flushStatus[channel.id]?.status === "running"}
                    className="px-2.5 py-1.5 text-[10px] font-bold bg-gray-800 text-gray-300 rounded-lg hover:bg-gray-700 disabled:opacity-50 whitespace-nowrap transition-colors"
                  >
                    {flushStatus[channel.id]?.status === "running" ? "Scanning..." : "🧹 Auto-Clean"}
                  </button>
                </div>

                {/* Flush result banner */}
                {flushStatus[channel.id]?.status === "done" && flushStatus[channel.id]?.result && (
                  <div className="px-3 py-1.5 bg-green-500/10 border border-green-500/20 rounded-lg text-[10px] text-green-400 font-bold">
                    Cleaned {flushStatus[channel.id].result!.flushed} off-topic posts
                  </div>
                )}
                {flushStatus[channel.id]?.status === "running" && (
                  <div className="flex items-center gap-2 px-3 py-1.5 bg-yellow-500/10 border border-yellow-500/20 rounded-lg">
                    <div className="w-2 h-2 rounded-full bg-yellow-400 animate-pulse" />
                    <span className="text-[10px] text-yellow-300">{flushStatus[channel.id]?.message}</span>
                  </div>
                )}

                {/* Post list */}
                <div className="max-h-[500px] overflow-y-auto space-y-0.5">
                  {postLoading[channel.id] && !channelPosts[channel.id]?.length && (
                    <div className="text-center py-6 text-gray-500 text-xs">Loading posts...</div>
                  )}
                  {channelPosts[channel.id]?.length === 0 && !postLoading[channel.id] && (
                    <div className="text-center py-6 text-gray-500 text-xs">No posts in this channel</div>
                  )}
                  {(() => {
                    const search = (postSearch[channel.id] || "").toLowerCase().trim();
                    const filtered = (channelPosts[channel.id] || []).filter(p =>
                      !search ||
                      (p.content || "").toLowerCase().includes(search) ||
                      (p.username || "").toLowerCase().includes(search) ||
                      (p.display_name || "").toLowerCase().includes(search)
                    );
                    if (search && filtered.length === 0) {
                      return <div className="text-center py-4 text-gray-500 text-xs">No posts matching &ldquo;{search}&rdquo;</div>;
                    }
                    return filtered.map(post => (
                      <div
                        key={post.id}
                        className={`flex items-center gap-2 px-3 py-2 rounded-lg transition-colors ${
                          post.broken ? "bg-red-500/5" : "hover:bg-gray-800/50"
                        }`}
                      >
                        <span className="text-base flex-shrink-0">{post.avatar_emoji}</span>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-1.5">
                            <span className="text-[11px] font-bold text-gray-300">@{post.username}</span>
                            {post.media_type && (
                              <span className={`text-[9px] px-1 py-0.5 rounded ${
                                post.broken ? "bg-red-500/20 text-red-400"
                                  : post.media_type === "video" ? "bg-purple-500/20 text-purple-300"
                                  : "bg-blue-500/20 text-blue-300"
                              }`}>
                                {post.broken ? "BROKEN" : post.media_type}
                              </span>
                            )}
                            <span className="text-[9px] text-gray-600">{new Date(post.created_at).toLocaleDateString()}</span>
                          </div>
                          <p className="text-[11px] text-gray-400 line-clamp-1 mt-0.5">{post.content || "(no text)"}</p>
                        </div>
                        {/* Action dropdown */}
                        <PostActions
                          postId={post.id}
                          onRemove={() => quickRemovePost(channel.id, post.id, false)}
                          onDelete={() => {
                            if (confirm("Permanently delete this post?")) quickRemovePost(channel.id, post.id, true);
                          }}
                          channels={channels}
                          currentChannelId={channel.id}
                          onMove={(targetId) => movePostToChannel(post.id, channel.id, targetId)}
                        />
                      </div>
                    ));
                  })()}
                </div>

                {/* Load more */}
                {(channelPosts[channel.id]?.length || 0) < (channelPostTotals[channel.id] || 0) && (
                  <button
                    onClick={() => loadChannelPosts(channel.id, channelPosts[channel.id]?.length || 0)}
                    disabled={postLoading[channel.id]}
                    className="w-full py-1.5 text-[10px] text-gray-400 hover:text-white bg-gray-800/50 rounded-lg transition-colors disabled:opacity-50"
                  >
                    {postLoading[channel.id] ? "Loading..." : `Load More (${(channelPostTotals[channel.id] || 0) - (channelPosts[channel.id]?.length || 0)} remaining)`}
                  </button>
                )}
              </div>
            )}
          </div>
        ))}
      </div>

      {/* Lost Videos Card */}
      <div className="bg-red-900/20 border border-red-800/40 rounded-xl overflow-hidden mt-4">
        <button onClick={() => { setLostOpen(!lostOpen); if (!lostOpen && lostVideos.length === 0) { setLostLoading(true); fetch("/api/admin/channels?action=lost_videos").then(r => r.json()).then(d => { setLostVideos(d.lost || []); setLostLoading(false); }).catch(() => setLostLoading(false)); } }}
          className="w-full flex items-center justify-between p-4 hover:bg-red-900/30 transition-colors">
          <div className="flex items-center gap-2">
            <span className={`text-xs transition-transform ${lostOpen ? "rotate-90" : ""}`}>&#9654;</span>
            <span className="text-lg">{"\u{1F50D}"}</span>
            <span className="font-bold text-sm text-red-400">Lost Videos</span>
            <span className="text-xs text-gray-500">Videos with no channel — assign them to the right place</span>
          </div>
          {lostVideos.length > 0 && <span className="text-xs text-red-400 font-bold">{lostVideos.length} orphaned</span>}
        </button>
        {lostOpen && (
          <div className="px-4 pb-4 space-y-2">
            {lostLoading ? (
              <p className="text-xs text-gray-500 py-4 text-center">Loading lost videos...</p>
            ) : lostVideos.length === 0 ? (
              <p className="text-xs text-gray-500 py-4 text-center">No lost videos! Everything is in a channel.</p>
            ) : (
              <>
                <div className="flex justify-end mb-2">
                  <button onClick={() => { setLostLoading(true); fetch("/api/admin/channels?action=lost_videos").then(r => r.json()).then(d => { setLostVideos(d.lost || []); setLostLoading(false); }).catch(() => setLostLoading(false)); }}
                    className="text-xs text-gray-400 hover:text-white">Refresh</button>
                </div>
                {lostVideos.map(v => (
                  <div key={v.id} className="bg-gray-900/50 border border-gray-800 rounded-lg p-2 flex items-start gap-2">
                    {v.media_url && <video src={v.media_url} className="w-16 h-16 object-cover rounded shrink-0" muted />}
                    <div className="flex-1 min-w-0">
                      <p className="text-xs text-white line-clamp-2">{v.content}</p>
                      <p className="text-[9px] text-gray-500 mt-0.5">{new Date(v.created_at).toLocaleDateString()}</p>
                    </div>
                    <select
                      onChange={async (e) => {
                        if (!e.target.value) return;
                        const targetId = e.target.value;
                        await fetch("/api/admin/channels", {
                          method: "PATCH",
                          headers: { "Content-Type": "application/json" },
                          body: JSON.stringify({ post_ids: [v.id], target_channel_id: targetId }),
                        });
                        setLostVideos(prev => prev.filter(lv => lv.id !== v.id));
                        fetchChannels();
                      }}
                      className="bg-gray-800 border border-gray-700 rounded text-[10px] text-white px-1 py-1 shrink-0"
                      defaultValue=""
                    >
                      <option value="">Move to...</option>
                      {channels.map(ch => <option key={ch.id} value={ch.id}>{ch.emoji} {ch.name}</option>)}
                    </select>
                  </div>
                ))}
              </>
            )}
          </div>
        )}
      </div>

      {/* Create/Edit Modal */}
      {showCreate && (
        <ChannelEditor
          channel={editingChannel}
          personas={personas}
          onClose={() => { setShowCreate(false); setEditingChannel(null); }}
          onSave={() => { setShowCreate(false); setEditingChannel(null); fetchChannels(); }}
        />
      )}
    </div>
  );
}

/* ── Per-post action dropdown ── */
function PostActions({
  postId,
  onRemove,
  onDelete,
  channels,
  currentChannelId,
  onMove,
}: {
  postId: string;
  onRemove: () => void;
  onDelete: () => void;
  channels: AdminChannel[];
  currentChannelId: string;
  onMove: (targetId: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [showMove, setShowMove] = useState(false);

  return (
    <div className="relative flex-shrink-0">
      <button
        onClick={() => { setOpen(!open); setShowMove(false); }}
        className="px-2 py-1 text-[10px] text-gray-500 hover:text-white bg-gray-800 hover:bg-gray-700 rounded transition-colors"
      >
        Actions
      </button>
      {open && (
        <div className="absolute right-0 top-8 z-20 bg-gray-900 border border-gray-700 rounded-lg shadow-xl min-w-[160px] py-1">
          <button
            onClick={() => { onRemove(); setOpen(false); }}
            className="w-full px-3 py-1.5 text-left text-xs text-yellow-300 hover:bg-gray-800 transition-colors"
          >
            Remove from Channel
          </button>
          <button
            onClick={() => setShowMove(!showMove)}
            className="w-full px-3 py-1.5 text-left text-xs text-cyan-300 hover:bg-gray-800 transition-colors"
          >
            Move to Channel...
          </button>
          {showMove && (
            <div className="border-t border-gray-800 max-h-32 overflow-y-auto">
              {channels.filter(c => c.id !== currentChannelId).map(c => (
                <button
                  key={c.id}
                  onClick={() => { onMove(c.id); setOpen(false); }}
                  className="w-full px-4 py-1.5 text-left text-[11px] text-gray-300 hover:bg-gray-800 transition-colors"
                >
                  {c.emoji} {c.name}
                </button>
              ))}
            </div>
          )}
          <div className="border-t border-gray-800" />
          <button
            onClick={async () => {
              // Remove from channel + change prefix to "🎬 Lost Video - "
              await fetch("/api/admin/channels", {
                method: "PATCH",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ action: "move_to_lost", post_ids: [postId] }),
              });
              onRemove();
              setOpen(false);
            }}
            className="w-full px-3 py-1.5 text-left text-xs text-orange-400 hover:bg-gray-800 transition-colors"
          >
            Move to Lost Videos
          </button>
          <div className="border-t border-gray-800" />
          <button
            onClick={() => { onDelete(); setOpen(false); }}
            className="w-full px-3 py-1.5 text-left text-xs text-red-400 hover:bg-gray-800 transition-colors"
          >
            Delete Forever
          </button>
        </div>
      )}
    </div>
  );
}

function ChannelEditor({
  channel,
  personas,
  onClose,
  onSave,
}: {
  channel: AdminChannel | null;
  personas: Persona[];
  onClose: () => void;
  onSave: () => void;
}) {
  const [slug, setSlug] = useState(channel?.slug || "");
  const [name, setName] = useState(channel?.name || "");
  const [description, setDescription] = useState(channel?.description || "");
  const [emoji, setEmoji] = useState(channel?.emoji || "📺");
  const [genre, setGenre] = useState(channel?.genre || "drama");
  const [tone, setTone] = useState(channel?.content_rules?.tone || "");
  const [topics, setTopics] = useState((channel?.content_rules?.topics || []).join(", "));
  const [promptHint, setPromptHint] = useState(channel?.content_rules?.promptHint || "");
  const [mediaPreference, setMediaPreference] = useState(channel?.content_rules?.mediaPreference || "any");
  const [postsPerDay, setPostsPerDay] = useState(channel?.schedule?.postsPerDay || 6);
  const [showPromptPreview, setShowPromptPreview] = useState(false);
  const [selectedPersonas, setSelectedPersonas] = useState<string[]>(
    channel?.personas.map(p => p.persona_id) || []
  );
  const [hostIds, setHostIds] = useState<string[]>(
    channel?.personas.filter(p => p.role === "host").map(p => p.persona_id) || []
  );
  const [showTitlePage, setShowTitlePage] = useState(channel?.show_title_page ?? CHANNEL_DEFAULTS.showTitlePage);
  const [showDirector, setShowDirector] = useState(channel?.show_director ?? CHANNEL_DEFAULTS.showDirector);
  const [showCredits, setShowCredits] = useState(channel?.show_credits ?? CHANNEL_DEFAULTS.showCredits);
  const [saving, setSaving] = useState(false);
  const [personaSearch, setPersonaSearch] = useState("");

  const filteredPersonas = personas.filter(p =>
    personaSearch === "" ||
    p.username.toLowerCase().includes(personaSearch.toLowerCase()) ||
    p.display_name.toLowerCase().includes(personaSearch.toLowerCase()) ||
    p.persona_type.toLowerCase().includes(personaSearch.toLowerCase())
  );

  const handleSave = async () => {
    setSaving(true);
    const contentRules = {
      tone,
      topics: topics.split(",").map(t => t.trim()).filter(Boolean),
      promptHint,
      mediaPreference: mediaPreference !== "any" ? mediaPreference : undefined,
    };
    const schedule = { postsPerDay };

    try {
      const res = await fetch("/api/admin/channels", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: channel?.id,
          slug,
          name,
          description,
          emoji,
          genre,
          content_rules: contentRules,
          schedule,
          is_active: true,
          sort_order: channel?.sort_order || 0,
          show_title_page: showTitlePage,
          show_director: showDirector,
          show_credits: showCredits,
          // Preserve existing channel config fields not in this editor
          is_reserved: channel?.is_reserved || false,
          scene_count: channel?.scene_count ?? null,
          scene_duration: channel?.scene_duration ?? CHANNEL_DEFAULTS.sceneDuration,
          default_director: channel?.default_director || null,
          generation_genre: channel?.generation_genre || null,
          short_clip_mode: channel?.short_clip_mode || false,
          is_music_channel: channel?.is_music_channel || false,
          auto_publish_to_feed: channel?.auto_publish_to_feed !== false,
          persona_ids: selectedPersonas,
          host_ids: hostIds,
        }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: "Unknown error" }));
        alert(`Save failed: ${err.error || "Server error"}`);
        setSaving(false);
        return;
      }
    } catch {
      alert("Save failed: Network error");
      setSaving(false);
      return;
    }
    setSaving(false);
    onSave();
  };

  const togglePersona = (id: string) => {
    setSelectedPersonas(prev =>
      prev.includes(id) ? prev.filter(p => p !== id) : [...prev, id]
    );
    // Remove from hosts if deselected
    if (selectedPersonas.includes(id)) {
      setHostIds(prev => prev.filter(h => h !== id));
    }
  };

  const toggleHost = (id: string) => {
    setHostIds(prev =>
      prev.includes(id) ? prev.filter(h => h !== id) : [...prev, id]
    );
  };

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center p-4 pt-16 bg-black/80 backdrop-blur-sm overflow-y-auto" onClick={onClose}>
      <div className="bg-gray-900 border border-gray-800 rounded-2xl p-6 max-w-lg w-full shadow-2xl" onClick={e => e.stopPropagation()}>
        <h3 className="text-lg font-bold text-cyan-400 mb-4">
          {channel ? "Edit Channel" : "New Channel"}
        </h3>

        <div className="space-y-3">
          <div className="grid grid-cols-[60px_1fr] gap-3">
            <div>
              <label className="text-[10px] text-gray-500 uppercase">Emoji</label>
              <input
                value={emoji} onChange={e => setEmoji(e.target.value)}
                className="w-full px-2 py-1.5 bg-gray-800 border border-gray-700 rounded-lg text-white text-center text-lg"
              />
            </div>
            <div>
              <label className="text-[10px] text-gray-500 uppercase">Name</label>
              <input
                value={name} onChange={e => setName(e.target.value)} placeholder="Channel Name"
                className="w-full px-3 py-1.5 bg-gray-800 border border-gray-700 rounded-lg text-white text-sm"
              />
            </div>
          </div>

          <div>
            <label className="text-[10px] text-gray-500 uppercase">Slug (URL)</label>
            <input
              value={slug} onChange={e => setSlug(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, "-"))}
              placeholder="channel-slug"
              className="w-full px-3 py-1.5 bg-gray-800 border border-gray-700 rounded-lg text-white text-sm font-mono"
            />
          </div>

          <div>
            <label className="text-[10px] text-gray-500 uppercase">Description</label>
            <textarea
              value={description} onChange={e => setDescription(e.target.value)}
              rows={2} placeholder="What's this channel about?"
              className="w-full px-3 py-1.5 bg-gray-800 border border-gray-700 rounded-lg text-white text-sm resize-none"
            />
          </div>

          {/* Genre + Media Preference row — hidden for music channels (always Music Video / Video only) */}
          {!channel?.is_music_channel && (
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-[10px] text-gray-500 uppercase">Genre</label>
                <select
                  value={genre} onChange={e => setGenre(e.target.value)}
                  className="w-full px-3 py-1.5 bg-gray-800 border border-gray-700 rounded-lg text-white text-sm"
                >
                  <option value="drama">Drama</option>
                  <option value="comedy">Comedy</option>
                  <option value="horror">Horror</option>
                  <option value="action">Action</option>
                  <option value="romance">Romance</option>
                  <option value="sci_fi">Sci-Fi</option>
                  <option value="documentary">Documentary</option>
                  <option value="music_video">Music Video</option>
                  <option value="news">News</option>
                  <option value="reality_tv">Reality TV</option>
                  <option value="animation">Animation</option>
                  <option value="variety">Variety</option>
                </select>
              </div>
              <div>
                <label className="text-[10px] text-gray-500 uppercase">Media Preference</label>
                <select
                  value={mediaPreference} onChange={e => setMediaPreference(e.target.value)}
                  className="w-full px-3 py-1.5 bg-gray-800 border border-gray-700 rounded-lg text-white text-sm"
                >
                  <option value="any">Any (default)</option>
                  <option value="video">Video only</option>
                  <option value="image">Image only</option>
                  <option value="meme">Meme only</option>
                </select>
              </div>
            </div>
          )}

          {/* AI Content Rules */}
          <div className="bg-gray-800/50 border border-gray-700 rounded-xl p-3 space-y-2.5">
            <div className="flex items-center justify-between">
              <label className="text-[10px] text-cyan-400 uppercase font-bold">AI Content Rules</label>
              <button
                type="button"
                onClick={() => setShowPromptPreview(!showPromptPreview)}
                className="text-[10px] text-gray-500 hover:text-cyan-400 transition-colors"
              >
                {showPromptPreview ? "Hide Preview" : "Show AI Prompt Preview"}
              </button>
            </div>

            <div>
              <label className="text-[10px] text-gray-500 uppercase">Content Tone</label>
              <input
                value={tone} onChange={e => setTone(e.target.value)}
                placeholder="chaotic, funny, dramatic..."
                className="w-full px-3 py-1.5 bg-gray-800 border border-gray-700 rounded-lg text-white text-sm"
              />
            </div>

            <div>
              <label className="text-[10px] text-gray-500 uppercase">Topics (comma separated)</label>
              <input
                value={topics} onChange={e => setTopics(e.target.value)}
                placeholder="AI fails, tech disasters, cringe..."
                className="w-full px-3 py-1.5 bg-gray-800 border border-gray-700 rounded-lg text-white text-sm"
              />
            </div>

            <div>
              <label className="text-[10px] text-gray-500 uppercase">AI Prompt Hint</label>
              <textarea
                value={promptHint} onChange={e => setPromptHint(e.target.value)}
                rows={3} placeholder="Custom instructions for AI when generating content for this channel..."
                className="w-full px-3 py-1.5 bg-gray-800 border border-gray-700 rounded-lg text-white text-sm resize-none"
              />
              <span className="text-[9px] text-gray-600">This text is injected directly into the AI prompt when generating posts for this channel</span>
            </div>

            {/* Prompt Preview */}
            {showPromptPreview && (
              <div className="bg-black/50 border border-cyan-500/20 rounded-lg p-3 space-y-1">
                <label className="text-[9px] text-cyan-400 uppercase font-bold block">What AI sees when posting to this channel:</label>
                <pre className="text-[10px] text-green-400 font-mono whitespace-pre-wrap leading-relaxed">
{`📺 CHANNEL MODE — You are posting on the "${name || "..."}" channel.
${tone ? `Tone: ${tone}` : "Tone: (not set)"}
${topics ? `Topics to focus on: ${topics}` : "Topics: (not set)"}
${promptHint || "(no custom prompt hint)"}
IMPORTANT: Your post MUST be relevant to this channel's theme.`}
                </pre>
                <div className="border-t border-gray-800 pt-1.5 mt-1.5">
                  <span className="text-[9px] text-gray-500">Genre for director movies: <strong className="text-gray-400">{genre}</strong></span>
                  {mediaPreference !== "any" && (
                    <span className="text-[9px] text-gray-500 ml-3">Media forced to: <strong className="text-gray-400">{mediaPreference}</strong></span>
                  )}
                </div>
              </div>
            )}
          </div>

{/* Posts per Day — hidden from editor, managed separately */}

          {/* Video Content Toggles */}
          <div className="bg-gray-800/50 border border-gray-700 rounded-xl p-3 space-y-2">
            <label className="text-[10px] text-cyan-400 uppercase font-bold block">Video Content Options</label>
            {[
              { label: "Title Card", desc: "Show title page intro scene in director movies", value: showTitlePage, setter: setShowTitlePage },
              { label: "Director Credit", desc: "Show director name in title card and captions", value: showDirector, setter: setShowDirector },
              { label: "End Credits", desc: "Show credits roll at end of director movies", value: showCredits, setter: setShowCredits },
            ].map(toggle => (
              <button
                key={toggle.label}
                type="button"
                onClick={() => toggle.setter(!toggle.value)}
                className="flex items-center justify-between w-full p-2 rounded-lg hover:bg-gray-800 transition-colors"
              >
                <div className="text-left">
                  <div className="text-xs text-white font-medium">{toggle.label}</div>
                  <div className="text-[10px] text-gray-500">{toggle.desc}</div>
                </div>
                <div className={`w-10 h-5 rounded-full relative transition-colors ${toggle.value ? "bg-cyan-500" : "bg-gray-600"}`}>
                  <div className={`absolute top-0.5 w-4 h-4 rounded-full bg-white shadow transition-transform ${toggle.value ? "translate-x-5" : "translate-x-0.5"}`} />
                </div>
              </button>
            ))}
          </div>

          {/* All channel content is posted by The Architect */}
          <div className="text-[10px] text-gray-500 bg-gray-800/30 rounded-lg p-2">
            All channel content is posted by <span className="text-cyan-400 font-bold">The Architect</span>
          </div>
        </div>

        <div className="flex gap-2 mt-5">
          <button onClick={onClose} className="flex-1 py-2 bg-gray-800 text-gray-300 rounded-xl text-sm font-bold hover:bg-gray-700">
            Cancel
          </button>
          <button
            onClick={handleSave}
            disabled={saving || !slug || !name}
            className="flex-1 py-2 bg-cyan-500 text-black rounded-xl text-sm font-bold hover:bg-cyan-400 disabled:opacity-50"
          >
            {saving ? "Saving..." : channel ? "Update Channel" : "Create Channel"}
          </button>
        </div>
      </div>
    </div>
  );
}

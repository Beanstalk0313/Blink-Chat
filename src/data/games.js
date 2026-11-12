// Game catalog for desktop game presence.
//
// One entry per game, matched against the executable names of running
// processes. `hints` disambiguates titles that share an executable (Call of
// Duty HQ runs every recent Call of Duty title from cod.exe, and Source games
// all use hl2.exe); the window title reported by the OS is matched against the
// hints, and the first entry for an executable is the fallback.
//
// Keep this list flat and dependency-free: it is imported by the detector, the
// profile UI and the Tauri bridge, and it is the only place a game needs to be
// added. Executable names are matched case-insensitively without their path.

export const GAME_CATALOG = [
  // ---- Required titles -------------------------------------------------
  { name: 'Counter-Strike 2', exes: ['cs2.exe'] },
  { name: 'Call of Duty', exes: ['cod.exe'], hints: ['call of duty'] },
  { name: 'Call of Duty: Warzone', exes: ['cod.exe', 'warzone.exe'], hints: ['warzone'] },
  { name: 'Call of Duty: Modern Warfare III (2023)', exes: ['cod.exe'], hints: ['modern warfare iii', 'mw3'] },
  { name: 'Call of Duty: Modern Warfare II (2022)', exes: ['cod.exe'], hints: ['modern warfare ii', 'mw2'] },
  { name: 'Call of Duty: Modern Warfare (2019)', exes: ['modernwarfare.exe'] },
  { name: 'Delta Force', exes: ['deltaforceclient-win64-shipping.exe', 'deltaforce.exe'] },
  { name: 'Portal', exes: ['portal.exe'] },
  { name: 'Portal 2', exes: ['portal2.exe'] },

  // ---- Valve / Source --------------------------------------------------
  { name: 'Counter-Strike: Global Offensive', exes: ['csgo.exe'] },
  { name: 'Half-Life 2', exes: ['hl2.exe'], hints: ['half-life 2', 'half life 2'] },
  { name: 'Team Fortress 2', exes: ['hl2.exe', 'tf_win64.exe'], hints: ['team fortress'] },
  { name: 'Garry\u2019s Mod', exes: ['gmod.exe'] },
  { name: 'Left 4 Dead 2', exes: ['left4dead2.exe'] },
  { name: 'Half-Life: Alyx', exes: ['hlvr.exe'] },
  { name: 'Dota 2', exes: ['dota2.exe'] },
  { name: 'Deadlock', exes: ['deadlock.exe', 'citadel.exe'] },

  // ---- Riot / Blizzard ------------------------------------------------
  { name: 'League of Legends', exes: ['league of legends.exe'] },
  { name: 'VALORANT', exes: ['valorant-win64-shipping.exe'] },
  { name: 'Teamfight Tactics', exes: ['leagueclient.exe'], hints: ['teamfight tactics', 'tft'] },
  { name: 'Overwatch 2', exes: ['overwatch.exe'] },
  { name: 'World of Warcraft', exes: ['wow.exe'] },
  { name: 'Diablo IV', exes: ['diablo iv.exe'] },
  { name: 'Hearthstone', exes: ['hearthstone.exe'] },
  { name: 'StarCraft II', exes: ['sc2_x64.exe'] },
  { name: 'Warcraft III: Reforged', exes: ['warcraft iii.exe'] },

  // ---- Epic / big-budget shooters -------------------------------------
  { name: 'Fortnite', exes: ['fortniteclient-win64-shipping.exe'] },
  { name: 'Rocket League', exes: ['rocketleague.exe'] },
  { name: 'Fall Guys', exes: ['fallguys_client_game.exe'] },
  { name: 'Apex Legends', exes: ['r5apex.exe', 'r5apex_dx12.exe'] },
  { name: 'Titanfall 2', exes: ['titanfall2.exe'] },
  { name: 'Battlefield 2042', exes: ['bf2042.exe'] },
  { name: 'Battlefield 1', exes: ['bf1.exe'] },
  { name: 'Battlefield V', exes: ['battlefieldv.exe'] },
  { name: 'Battlefield 4', exes: ['bf4.exe'] },
  { name: 'The Sims 4', exes: ['ts4_x64.exe', 'sims4.exe'] },
  { name: 'It Takes Two', exes: ['ittakestwo.exe'] },
  { name: 'Star Wars Jedi: Survivor', exes: ['jedisurvivor.exe'] },
  { name: 'EA Sports FC 25', exes: ['fc25.exe'] },
  { name: 'EA Sports FC 24', exes: ['fc24.exe'] },
  { name: 'Madden NFL 25', exes: ['madden25.exe'] },
  { name: 'NBA 2K25', exes: ['nba2k25.exe'] },

  // ---- Ubisoft ---------------------------------------------------------
  { name: 'Tom Clancy\u2019s Rainbow Six Siege', exes: ['rainbowsix.exe', 'rainbowsix_dx11.exe', 'rainbowsix_vulkan.exe'] },
  { name: 'Tom Clancy\u2019s Ghost Recon Breakpoint', exes: ['grb.exe'] },
  { name: 'Tom Clancy\u2019s The Division 2', exes: ['thedivision2.exe'] },
  { name: 'For Honor', exes: ['forhonor.exe'] },
  { name: 'Assassin\u2019s Creed Valhalla', exes: ['acvalhalla.exe'] },
  { name: 'Assassin\u2019s Creed Odyssey', exes: ['acodyssey.exe'] },
  { name: 'Assassin\u2019s Creed Mirage', exes: ['acmirage.exe'] },
  { name: 'Far Cry 6', exes: ['farcry6.exe'] },
  { name: 'Far Cry 5', exes: ['farcry5.exe'] },
  { name: 'Watch Dogs: Legion', exes: ['watchdogslegion.exe'] },
  { name: 'Skull and Bones', exes: ['skullandbones.exe'] },
  { name: 'The Crew Motorfest', exes: ['thecrewmotorfe.exe', 'thecrewmotorfest.exe'] },

  // ---- Rockstar / Bethesda / CDPR / FromSoftware -----------------------
  { name: 'Grand Theft Auto V', exes: ['gta5.exe'] },
  { name: 'Grand Theft Auto V Enhanced', exes: ['gta5_enhanced.exe'] },
  { name: 'Red Dead Redemption 2', exes: ['rdr2.exe'] },
  { name: 'The Elder Scrolls V: Skyrim', exes: ['skyrimse.exe', 'skyrim.exe'] },
  { name: 'Fallout 4', exes: ['fallout4.exe'] },
  { name: 'Fallout 76', exes: ['fallout76.exe'] },
  { name: 'Starfield', exes: ['starfield.exe'] },
  { name: 'DOOM Eternal', exes: ['doometernalx64vk.exe'] },
  { name: 'Cyberpunk 2077', exes: ['cyberpunk2077.exe'] },
  { name: 'The Witcher 3: Wild Hunt', exes: ['witcher3.exe'] },
  { name: 'Elden Ring', exes: ['eldenring.exe'] },
  { name: 'ELDEN RING NIGHTREIGN', exes: ['nightreign.exe'] },
  { name: 'Dark Souls III', exes: ['darksoulsiii.exe'] },
  { name: 'Sekiro: Shadows Die Twice', exes: ['sekiro.exe'] },
  { name: 'Armored Core VI', exes: ['armoredcore6.exe'] },

  // ---- Extraction / survival / co-op ----------------------------------
  { name: 'Escape from Tarkov', exes: ['escapefromtarkov.exe'] },
  { name: 'PUBG: BATTLEGROUNDS', exes: ['tslgame.exe'] },
  { name: 'Warframe', exes: ['warframe.x64.exe'] },
  { name: 'Path of Exile', exes: ['pathofexile.exe', 'pathofexilesteam.exe'] },
  { name: 'Path of Exile 2', exes: ['pathofexile_x64.exe', 'pathofexilesteam_x64.exe'] },
  { name: 'Lost Ark', exes: ['lostark.exe'] },
  { name: 'New World', exes: ['newworld.exe'] },
  { name: 'Black Desert Online', exes: ['blackdesert64.exe'] },
  { name: 'Rust', exes: ['rustclient.exe'] },
  { name: 'Valheim', exes: ['valheim.exe'] },
  { name: 'Palworld', exes: ['palworld-win64-shipping.exe'] },
  { name: 'ARK: Survival Ascended', exes: ['arkascended.exe', 'shootergame.exe'] },
  { name: 'DayZ', exes: ['dayz_x64.exe'] },
  { name: 'The Forest', exes: ['theforest.exe'] },
  { name: 'Sons of the Forest', exes: ['sonsoftheforest.exe'] },
  { name: 'Subnautica', exes: ['subnautica.exe'] },
  { name: 'Subnautica: Below Zero', exes: ['subnauticazero.exe'] },
  { name: 'No Man\u2019s Sky', exes: ['nms.exe', 'nomanssky.exe'] },
  { name: 'Raft', exes: ['raft.exe'] },
  { name: 'Phasmophobia', exes: ['phasmophobia.exe'] },
  { name: 'Lethal Company', exes: ['lethal company.exe'] },
  { name: 'Content Warning', exes: ['content warning.exe'] },
  { name: 'R.E.P.O.', exes: ['repo.exe'] },
  { name: 'PEAK', exes: ['peak.exe'] },
  { name: 'Schedule I', exes: ['schedulei.exe'] },
  { name: 'Helldivers 2', exes: ['helldivers2.exe'] },
  { name: 'Deep Rock Galactic', exes: ['fsd-win64-shipping.exe'] },
  { name: 'Sea of Thieves', exes: ['sotgame.exe'] },
  { name: 'Among Us', exes: ['among us.exe'] },
  { name: 'Terraria', exes: ['terraria.exe'] },
  { name: 'Stardew Valley', exes: ['stardew valley.exe'] },
  { name: 'Satisfactory', exes: ['factorygame-win64-shipping.exe'] },
  { name: 'Factorio', exes: ['factorio.exe'] },
  { name: 'RimWorld', exes: ['rimworldwin64.exe'] },
  { name: 'Oxygen Not Included', exes: ['oxygennotincluded.exe'] },
  { name: '7 Days to Die', exes: ['7daystodie.exe'] },
  { name: 'Project Zomboid', exes: ['projectzomboid64.exe'] },
  { name: 'Dead by Daylight', exes: ['deadbydaylight-win64-shipping.exe'] },
  { name: 'Hunt: Showdown 1896', exes: ['huntgame.exe', 'hunt.exe'] },
  { name: 'Rainbow Six Extraction', exes: ['r6extraction.exe'] },

  // ---- Fighting / brawlers -------------------------------------------
  { name: 'Street Fighter 6', exes: ['streetfighter6.exe'] },
  { name: 'Tekken 8', exes: ['tekken8.exe'] },
  { name: 'Mortal Kombat 1', exes: ['mk1.exe'] },
  { name: 'Guilty Gear -Strive-', exes: ['ggst-win64-shipping.exe'] },
  { name: 'Super Smash Bros. (emulated)', exes: ['ryujinx.exe', 'cemu.exe'] },

  // ---- Sandbox / creative / social -----------------------------------
  { name: 'Minecraft', exes: ['minecraft.windows.exe', 'minecraftlauncher.exe'] },
  { name: 'Roblox', exes: ['robloxplayerbeta.exe'] },
  { name: 'Halo Infinite', exes: ['haloinfinite.exe'] },
  { name: 'Halo: The Master Chief Collection', exes: ['mcc-win64-shipping.exe'] },
  { name: 'Destiny 2', exes: ['destiny2.exe'] },
  { name: 'Marvel Rivals', exes: ['marvelrivals.exe', 'marvelrivals-win64-shipping.exe'] },
  { name: 'The Finals', exes: ['discovery.exe', 'thefinals.exe'] },
  { name: 'XDefiant', exes: ['xdefiant.exe'] },
  { name: 'Splitgate 2', exes: ['splitgate2.exe'] },
  { name: 'Halo 3', exes: ['halo3.exe'] },

  // ---- Strategy / management -----------------------------------------
  { name: 'Age of Empires IV', exes: ['reliccardinal.exe'] },
  { name: 'Age of Empires II: Definitive Edition', exes: ['aoe2de_s.exe'] },
  { name: 'Total War: WARHAMMER III', exes: ['warhammer3.exe'] },
  { name: 'Sid Meier\u2019s Civilization VI', exes: ['civilizationvi.exe', 'civilizationvi_dx12.exe'] },
  { name: 'Sid Meier\u2019s Civilization VII', exes: ['civilizationvii.exe'] },
  { name: 'Cities: Skylines II', exes: ['cities2.exe'] },
  { name: 'Crusader Kings III', exes: ['ck3.exe'] },
  { name: 'Stellaris', exes: ['stellaris.exe'] },
  { name: 'Hearts of Iron IV', exes: ['hoi4.exe'] },
  { name: 'Football Manager 2024', exes: ['fm.exe'] },

  // ---- Racing / flight / sports --------------------------------------
  { name: 'Forza Horizon 5', exes: ['forzahorizon5.exe'] },
  { name: 'Forza Motorsport', exes: ['forzamotorsport.exe'] },
  { name: 'Microsoft Flight Simulator', exes: ['flightsimulator.exe'] },
  { name: 'F1 24', exes: ['f1_24.exe'] },
  { name: 'Assetto Corsa Competizione', exes: ['acc.exe'] },
  { name: 'BeamNG.drive', exes: ['beamng.drive.exe', 'beamng.drive.x64.exe'] },
  { name: 'iRacing', exes: ['iracingsim64dx11.exe'] },

  // ---- Single-player / indie -----------------------------------------
  { name: 'Hades', exes: ['hades.exe'] },
  { name: 'Hades II', exes: ['hades2.exe'] },
  { name: 'Hollow Knight', exes: ['hollow_knight.exe'] },
  { name: 'Hollow Knight: Silksong', exes: ['silksong.exe'] },
  { name: 'Celeste', exes: ['celeste.exe'] },
  { name: 'Cuphead', exes: ['cuphead.exe'] },
  { name: 'Dead Cells', exes: ['deadcells.exe'] },
  { name: 'Slay the Spire', exes: ['slaythespire.exe'] },
  { name: 'Balatro', exes: ['balatro.exe'] },
  { name: 'Vampire Survivors', exes: ['vampiresurvivors.exe'] },
  { name: 'Bloons TD 6', exes: ['btd6.exe'] },
  { name: 'Outer Wilds', exes: ['outerwilds.exe'] },
  { name: 'Outer Wilds: Echoes of the Eye', exes: ['outerwilds.exe'], hints: ['echoes of the eye'] },
  { name: 'Baldur\u2019s Gate 3', exes: ['bg3.exe', 'bg3_dx11.exe'] },
  { name: 'Divinity: Original Sin 2', exes: ['eocapp.exe'] },
  { name: 'Disco Elysium', exes: ['disco elysium.exe'] },
  { name: 'Undertale', exes: ['undertale.exe'] },
  { name: 'Deltarune', exes: ['deltarune.exe'] },
  { name: 'Stray', exes: ['stray-win64-shipping.exe'] },
  { name: 'It Takes Two (Friend\u2019s Pass)', exes: ['ittakestwo.exe'], hints: ['friend'] },
  { name: 'Resident Evil 4', exes: ['re4.exe'] },
  { name: 'Resident Evil Village', exes: ['re8.exe'] },
  { name: 'Silent Hill 2', exes: ['sh2.exe'] },
  { name: 'Alan Wake 2', exes: ['alanwake2.exe'] },
  { name: 'Control', exes: ['control_dx12.exe', 'control.exe'] },
  { name: 'Death Stranding', exes: ['deathstranding.exe'] },
  { name: 'Horizon Zero Dawn', exes: ['horizonzerodawn.exe'] },
  { name: 'Horizon Forbidden West', exes: ['horizonforbiddenwest.exe'] },
  { name: 'God of War', exes: ['gow.exe'] },
  { name: 'God of War Ragnar\u00f6k', exes: ['gowragnarok.exe'] },
  { name: 'The Last of Us Part I', exes: ['tlou-i.exe', 'tlou.exe'] },
  { name: 'Ghost of Tsushima', exes: ['ghostoftsushima.exe'] },
  { name: 'Spider-Man Remastered', exes: ['spiderman.exe'] },
  { name: 'Spider-Man: Miles Morales', exes: ['spidermanmilesmorales.exe'] },
  { name: 'Detroit: Become Human', exes: ['detroitbecomehuman.exe'] },
  { name: 'Persona 5 Royal', exes: ['p5r.exe'] },
  { name: 'NieR: Automata', exes: ['nierautomata.exe'] },
  { name: 'Monster Hunter: World', exes: ['monsterhunterworld.exe'] },
  { name: 'Monster Hunter Wilds', exes: ['monsterhunterwilds.exe'] },
  { name: 'Final Fantasy XIV', exes: ['ffxiv_dx11.exe'] },
  { name: 'Final Fantasy VII Rebirth', exes: ['ff7rebirth.exe'] },
  { name: 'Genshin Impact', exes: ['genshinimpact.exe'] },
  { name: 'Honkai: Star Rail', exes: ['starrail.exe'] },
  { name: 'Zenless Zone Zero', exes: ['zenlesszonezero.exe'] },
  { name: 'Wuthering Waves', exes: ['client-win64-shipping.exe'] },
  { name: 'Arknights: Endfield', exes: ['endfield.exe'] },
  { name: 'Delta Force: Hawk Ops', exes: ['deltaforceclient-win64-shipping.exe'], hints: ['hawk ops'] },
  { name: 'The Sims 3', exes: ['ts3w.exe'] },
  { name: 'Cities: Skylines', exes: ['cities.exe'] },
  { name: 'Planet Coaster 2', exes: ['planetcoaster2.exe'] },
  { name: 'Planet Zoo', exes: ['planetzoo.exe'] },
  { name: 'Two Point Museum', exes: ['two point museum.exe'] },
  { name: 'Dwarf Fortress', exes: ['dwarfort.exe', 'df.exe'] },
  { name: 'Kerbal Space Program', exes: ['ksp_x64.exe'] },
  { name: 'Space Engineers', exes: ['spaceengineers.exe'] },
  { name: 'Elite Dangerous', exes: ['elitedangerous64.exe'] },
  { name: 'EVE Online', exes: ['exefile.exe'] },
  { name: 'Star Citizen', exes: ['starcitizen.exe'] },
];

// exe (lowercase) -> candidate entries, first entry is the fallback.
const byExecutable = new Map();
for (const game of GAME_CATALOG) {
  for (const exe of game.exes) {
    const key = exe.toLowerCase();
    if (!byExecutable.has(key)) byExecutable.set(key, []);
    const candidates = byExecutable.get(key);
    if (!candidates.some(candidate => candidate.name === game.name)) candidates.push(game);
  }
}

export const GAME_EXECUTABLES = [...byExecutable.keys()];

// Resolves the processes reported by the desktop shell to a single game.
// `processes` is [{ exe, title }] with bare executable names.
export function resolveRunningGame(processes = []) {
  for (const process of processes) {
    const exe = String(process?.exe || '').toLowerCase();
    const candidates = byExecutable.get(exe);
    if (!candidates || !candidates.length) continue;
    const title = String(process?.title || '').toLowerCase();
    const hinted = title ? candidates.find(candidate => (candidate.hints || []).some(hint => title.includes(hint))) : null;
    const match = hinted || candidates[0];
    return { name: match.name, exe };
  }
  return null;
}

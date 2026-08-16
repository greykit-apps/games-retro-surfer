/*!
 * Retro Surfer '96 — a tiny, dependency-free pixel-art easter-egg game.
 * SkiFree/Surf-style: ride down the information superhighway, carve past
 * legacy tech, grab security powerups, outrun Clippy.
 *
 * Controls: ArrowLeft/ArrowRight lean the board, ArrowDown tucks for speed
 *           along whichever way you're pointing, ArrowUp brakes, Space
 *           holds a jump against the charge meter. Enter starts.
 *
 * Usage:
 *   <script src="retro-surfer.js"></script>
 *   <div data-retro-surfer></div>
 * or:
 *   RetroSurfer.mount(el, { width: 420, autofocus: true });
 * or, as a hidden easter egg:
 *   RetroSurfer.konami();   // Konami code opens it in an overlay
 */
(function (global) {
  "use strict";

  // ------------------------------------------------------------------
  // Internal resolution. Sprites are 32x32 and drawn 1:1 here, then the
  // whole canvas is upscaled by CSS with image-rendering:pixelated.
  // ------------------------------------------------------------------
  var W = 320;
  var H = 480;
  var PLAYER_Y = 150;
  var HIGH_KEY = "retroSurferHighScore";

  // The board leans anywhere in [-60, 60] degrees and you always travel along
  // it, so cos(lean) is your descent rate and sin(lean) is your drift. The
  // angle is continuous; the art is sampled from it every 15 degrees.
  var MAX_LEAN = 60;
  var POSE_STEP = 15;
  var NEAR_MISS = 15;    // px of clearance that still counts as a near miss
  var MAGNET = 34;       // px within which a pickup starts reaching for you
  var SHIELD_R = 15;     // Norton bubble radius — drawn and collided alike
  var LINK_COUNT = 4;    // links opened by one hyperlink pickup
  var LINK_GAP = 95;     // px between links along the line you are riding

  // Jump charge. Fills only while you're making clean progress: scaled by how
  // fast you're actually descending, and ramped in over JUMP_RAMP seconds
  // since the last knock, so a crash costs you the momentum of the meter as
  // well as a life. A full bar is MAX_AIR seconds of air — spend it as one
  // long flight or three hops big enough to clear a single obstacle.
  var MAX_AIR = 1.8;
  var AIR_DRAIN = 1 / MAX_AIR;
  var MIN_JUMP = 0.15;   // charge needed to leave the ground at all
  var MIN_AIR = MAX_AIR / 3;  // a tap buys exactly one hop: three per bar
  var JUMP_FILL = 0.1;   // charge/sec at full ramp and reference speed
  var JUMP_REF = 250;    // px/sec of descent that counts as reference speed
  var JUMP_RAMP = 5;     // sec of clean riding before the meter fills at full rate
  var TURN_RATE = 168;   // deg/sec once the lean is fully committed
  var TURN_EASE = 12;    // how fast turn speed ramps up and dies away
  var POSE = ["pose0", "pose1", "pose2", "pose3", "pose4",
    "pose5", "pose6", "pose7", "pose8"];
  // same nine angles, crouched — used while tucking
  var TUCK = ["tuck0", "tuck1", "tuck2", "tuck3", "tuck4",
    "tuck5", "tuck6", "tuck7", "tuck8"];

  // ------------------------------------------------------------------
  // 3x5 bitmap font — enough for the HUD and the title cards.
  // ------------------------------------------------------------------
  var FONT = {
    A: "111,101,111,101,101", B: "110,101,110,101,110", C: "111,100,100,100,111",
    D: "110,101,101,101,110", E: "111,100,111,100,111", F: "111,100,111,100,100",
    G: "111,100,101,101,111", H: "101,101,111,101,101", I: "111,010,010,010,111",
    J: "001,001,001,101,111", K: "101,101,110,101,101", L: "100,100,100,100,111",
    M: "101,111,111,101,101", N: "101,111,111,111,101", O: "111,101,101,101,111",
    P: "111,101,111,100,100", Q: "111,101,101,111,001", R: "111,101,111,110,101",
    S: "111,100,111,001,111", T: "111,010,010,010,010", U: "101,101,101,101,111",
    V: "101,101,101,101,010", W: "101,101,111,111,101", X: "101,101,010,101,101",
    Y: "101,101,010,010,010", Z: "111,001,010,100,111",
    0: "111,101,101,101,111", 1: "010,110,010,010,111", 2: "111,001,111,100,111",
    3: "111,001,111,001,111", 4: "101,101,111,001,001", 5: "111,100,111,001,111",
    6: "111,100,111,101,111", 7: "111,001,001,001,001", 8: "111,101,111,101,111",
    9: "111,101,111,001,111",
    " ": "000,000,000,000,000", ".": "000,000,000,000,010", ":": "000,010,000,010,000",
    "-": "000,000,111,000,000", "!": "010,010,010,000,010", "?": "111,001,011,000,010",
    "/": "001,001,010,100,100", "'": "010,010,000,000,000", "+": "000,010,111,010,000",
    "<": "001,010,100,010,001", ">": "100,010,001,010,100", "*": "101,010,111,010,101",
    "%": "101,001,010,100,101", ",": "000,000,000,010,100"
  };

  function textWidth(str, scale) {
    return str.length * 4 * scale - scale;
  }

  function drawText(ctx, str, x, y, color, scale) {
    scale = scale || 1;
    ctx.fillStyle = color;
    str = String(str).toUpperCase();
    for (var i = 0; i < str.length; i++) {
      var glyph = FONT[str[i]];
      if (!glyph) continue;
      var rows = glyph.split(",");
      for (var r = 0; r < 5; r++) {
        for (var c = 0; c < 3; c++) {
          if (rows[r][c] === "1") {
            ctx.fillRect(x + (i * 4 + c) * scale, y + r * scale, scale, scale);
          }
        }
      }
    }
  }

  function drawTextCentered(ctx, str, y, color, scale) {
    drawText(ctx, str, Math.round((W - textWidth(str, scale)) / 2), y, color, scale);
  }

  // ------------------------------------------------------------------
  // Sprites. Each is a list of equal-length rows; characters index into
  // that sprite's own palette, '.' is transparent. Generated art — edit a
  // row and the change shows up directly.
  // ------------------------------------------------------------------
  var SPRITES = {
    pose0: {
      palette: { K: "#0a0d18", S: "#1b6fd0", B: "#3aa0ff", C: "#bfe9ff", H: "#d19a5c", M: "#f2d9b6", N: "#5c3416", T: "#28e0c0", J: "#14a08a", P: "#2b3550" },
      rows: [
        "................................",
        "..........K....K................",
        ".........KHK..KHK...............",
        "........KHNHKKHNHK..............",
        "........KHHHHHHHHNK.............",
        "........KHHHHHHHNNK.............",
        "......KKKHKHHHKHHNK.............",
        ".....KHHKHKMMMKHHK..............",
        "....KHHHHHMNNNMHHK..............",
        "....KHHHHHMMNMMHHK..............",
        ".....KHHTTHMMMMHHK..............",
        "......KKTTTTMMJJJJK.............",
        "........KTTTTTTJJJK.............",
        "........KTTTTTTTTJK.....KK......",
        "........KTTTTTTTTTTKKKKKSSK.....",
        ".........KTTTTJTTTTHHSSCCCCK....",
        ".........KTTTTJJJTHHHHBCCCCSK...",
        ".........KPPPPPPPPHHHHCCCCCK....",
        "........KPPPPPPPPPKBHCCCBCSK....",
        "........KPPPPPPPPPKCCCCBSSK.....",
        "........KPPPPPPPPPCCCBBSSK......",
        "........KKKKKBBCCCCBBBSSK.......",
        ".......KKKKKKCCCCBBBSSSK........",
        "......KSSKKKKCCCBBBSSKK.........",
        ".....KSSBCCCCCBBBSSSK...........",
        "....KSCBCCCCBBBSSSKK............",
        "....KCCCCCBBBSSSKK..............",
        "...KSCCCCBBSSSKK................",
        "....KCCCCSSSKK..................",
        ".....KSSKKKK....................",
        "......KK........................",
        "................................"
      ]
    },
    tuck0: {
      palette: { K: "#0a0d18", S: "#1b6fd0", B: "#3aa0ff", C: "#bfe9ff", H: "#d19a5c", M: "#f2d9b6", N: "#5c3416", T: "#28e0c0", J: "#14a08a", P: "#2b3550" },
      rows: [
        "................................",
        "................................",
        "................................",
        "...................K............",
        "..................KNK...........",
        ".................KNNK...........",
        "........KK...KK.KNNNK...........",
        ".......KHHK.KHHKKNNK............",
        ".......KNHKKKHNKKNNK............",
        "......KHHHHHHHHKNNNK............",
        ".......KHHHHHHHKHNHK............",
        ".......KHKHHHKHKHHHK............",
        "......KHHKMMMKHHHHHK............",
        ".......KHMNNNMHHHHK.....KK......",
        ".......KHMMNMMHHHHK.KKKKSSK.....",
        "........KMMMMMTTHHKKSSSCCCCK....",
        "........KTMMMTTTTJSSSBBCCCCSK...",
        "........KTTTTTTTTTTBBBCCCCCK....",
        ".........KTTTTJJTTTTHHCCBCSK....",
        ".........KTTTTJJJTTHHHCBSSK.....",
        ".........KPPPPPPPPCHHHBSSK......",
        "........KPPPPPPPPPCBHHSSK.......",
        ".......KKKKKKCCCCBBBSSSK........",
        "......KSSKKKKCCCBBBSSKK.........",
        ".....KSSBCCCCCBBBSSSK...........",
        "....KSCBCCCCBBBSSSKK............",
        "....KCCCCCBBBSSSKK..............",
        "...KSCCCCBBSSSKK................",
        "....KCCCCSSSKK..................",
        ".....KSSKKKK....................",
        "......KK........................",
        "................................"
      ]
    },
    pose1: {
      palette: { K: "#0a0d18", S: "#1b6fd0", B: "#3aa0ff", C: "#bfe9ff", H: "#d19a5c", M: "#f2d9b6", N: "#5c3416", T: "#28e0c0", J: "#14a08a", P: "#2b3550" },
      rows: [
        "................................",
        "..........KK...KK...............",
        ".........KHHK.KHHK..............",
        ".........KNHKKNHNK..............",
        "........KHHHHHHHHHK.............",
        ".........KHHHHHHHK..............",
        ".........KHKHHHKHK..............",
        "......KK.KHKMMMKHK..............",
        ".....KHHKKHMNNNMHK..............",
        "....KHHHHKHMMNMMHK..............",
        "....KHHHHTTMMMMMKK..............",
        ".....KHHTTTTMMMJJJK...KKK.......",
        "......KKKKTTTTTTJJK.KKSSSK......",
        ".........KTTTTTTTTTKSSCCCSK.....",
        ".........KTTTTTTTTTTHHCCCSK.....",
        ".........KTTTTTJJTTHHHHCCSK.....",
        ".........KTTTTTJJJBHHHHBSK......",
        ".........KPPPPPPPPKCHHBSSK......",
        ".........KPPPPPPPPKCCBBSK.......",
        ".........KPPPPPPPPCCBBSK........",
        ".........KPPPPPPPPCBBSSK........",
        "..........KKKKBCCCBBSSK.........",
        ".........KKKKKCCCBBSSK..........",
        "........KSKKKKCCBBSSK...........",
        "........KSKKKCCBBSSK............",
        ".......KSBBCCCBBSSK.............",
        "......KSSBCCCBBSSK..............",
        "......KSBCCCBBSSK...............",
        ".....KSCCCCBBSSK................",
        ".....KSCCCBSSKK.................",
        ".....KSCCCSSK...................",
        "......KSSSKK...................."
      ]
    },
    tuck1: {
      palette: { K: "#0a0d18", S: "#1b6fd0", B: "#3aa0ff", C: "#bfe9ff", H: "#d19a5c", M: "#f2d9b6", N: "#5c3416", T: "#28e0c0", J: "#14a08a", P: "#2b3550" },
      rows: [
        "................................",
        "................................",
        "................K...............",
        "...............KNK..............",
        "..............KNNK..............",
        "..............KNNK..............",
        ".........K....KNNK..............",
        "........KHK..KHHNK..............",
        "........KNHKKKNHNK..............",
        ".......KHHHHHHHHNK..............",
        "........KHHHHHHHHK..............",
        "........KHKHHHKHHK....KKK.......",
        ".......KHHKMMMKHHK..KKSSSK......",
        ".......KHHMNNNMHHK.KSSCCCSK.....",
        ".......KHHMMNMMHHKKSSBCCCSK.....",
        "........KHMMMMMTTHSBBCCCCSK.....",
        ".........KTMMMTTTTTBCCCBSK......",
        ".........KTTTTTTTTTTHHHSSK......",
        ".........KTTTTTJJTTTHHHSK.......",
        ".........KTTTTTJJJCCHHHK........",
        ".........KPPPPPPPPCBBSSK........",
        ".........KPPPPPPPPBBSSK.........",
        ".........KKKKKCCCBBSSK..........",
        "........KSKKKKCCBBSSK...........",
        "........KSKKKCCBBSSK............",
        ".......KSBBCCCBBSSK.............",
        "......KSSBCCCBBSSK..............",
        "......KSBCCCBBSSK...............",
        ".....KSCCCCBBSSK................",
        ".....KSCCCBSSKK.................",
        ".....KSCCCSSK...................",
        "......KSSSKK...................."
      ]
    },
    pose2: {
      palette: { K: "#0a0d18", S: "#1b6fd0", B: "#3aa0ff", C: "#bfe9ff", H: "#d19a5c", M: "#f2d9b6", N: "#5c3416", T: "#28e0c0", J: "#14a08a", P: "#2b3550" },
      rows: [
        "................................",
        "...........KK...KK..............",
        "..........KHHK.KHHK.............",
        "..........KNHKKKHNK.............",
        ".........KHHHHHHHHK.............",
        "..........KHHHHHHHK.............",
        "..........KHKHHHKHK.............",
        ".........KHHKMMMKHK.............",
        ".......K..KHMNNNMHK.............",
        "......KHKKKHMMNMMHK..K..........",
        ".....KHHHTKHMMMMMKKKKSK.........",
        ".....KHHHTTTTMMMJJJSCCCK........",
        ".....KHHTTTTTTTTTTJCCCCSK.......",
        "......KKKKKTTTTTTTTTTHHSK.......",
        "..........KTTTTTTTTTHHHHK.......",
        "..........KTTTTTJJJTHHHHK.......",
        "..........KTTTTTJJJCBHHK........",
        "..........KPPPPPPPPCBSSK........",
        "..........KPPPPPPPPBBSK.........",
        "..........KPPPPPPPPBSSK.........",
        "..........KPPPPPPPPBSK..........",
        "...........KKKKCCCBSSK..........",
        "...........KKKKCCBBSK...........",
        "..........KKKKKKBBSSK...........",
        ".........KSKKKKCBBSK............",
        ".........KSBKKCBBSSK............",
        "........KSSBCCCBSSK.............",
        "........KSBBCCBBSK..............",
        "........KSBCCCBSSK..............",
        "........KCCCCBSSK...............",
        ".......KSCCCBSSK................",
        ".......KSCCCCSK................."
      ]
    },
    tuck2: {
      palette: { K: "#0a0d18", S: "#1b6fd0", B: "#3aa0ff", C: "#bfe9ff", H: "#d19a5c", M: "#f2d9b6", N: "#5c3416", T: "#28e0c0", J: "#14a08a", P: "#2b3550" },
      rows: [
        "................................",
        "................................",
        ".............K..................",
        "............KNK.................",
        "............KNNK................",
        "............KNNK................",
        "..........KKKNNKK...............",
        ".........KHHNNNKHK..............",
        ".........KHNNNNHNK..............",
        ".........KHHHHHHHHK..K..........",
        ".........KHHHHHHHK.KKSK.........",
        ".........KHKHHHKHKKSCCCK........",
        ".........KHKMMMKHHSCCCCSK.......",
        "........KHHMNNNMHHSBCCCSK.......",
        ".......KHHHMMNMMHSBCCCCK........",
        "........KHHMMMMMTTTCCBSK........",
        ".........KTTMMMTTTTTHHHK........",
        "..........KTTTTTTTTTHHHK........",
        "..........KTTTTTJJJBHHHK........",
        "..........KTTTTTJJJBSSK.........",
        "..........KPPPPPPPPBSK..........",
        "..........KPPPPPPPPSSK..........",
        "...........KKKKCCBBSK...........",
        "..........KKKKKKBBSSK...........",
        ".........KSKKKKCBBSK............",
        ".........KSBKKCBBSSK............",
        "........KSSBCCCBSSK.............",
        "........KSBBCCBBSK..............",
        "........KSBCCCBSSK..............",
        "........KCCCCBSSK...............",
        ".......KSCCCBSSK................",
        ".......KSCCCCSK................."
      ]
    },
    pose3: {
      palette: { K: "#0a0d18", S: "#1b6fd0", B: "#3aa0ff", C: "#bfe9ff", H: "#d19a5c", M: "#f2d9b6", N: "#5c3416", T: "#28e0c0", J: "#14a08a", P: "#2b3550" },
      rows: [
        "................................",
        "............KK...KK.............",
        "..........KKHHK.KHHK............",
        ".........KNKNHKKKHNK............",
        ".........KNHHHHHHHHHK...........",
        ".........KNNHHHHHHHK............",
        ".........KNNHKHHHKHK............",
        ".........KNHHKMMMKHK............",
        ".........KNNHMNNNMHK............",
        ".......KKKHHHMMNMMHSK...........",
        "......KHHKHHHMMMMMCCSK..........",
        ".....KHHHHTTTTMMMJJJSKKK........",
        ".....KHHHHTTTTTTTTTTTTHHK.......",
        "......KHHKTTTTTTTTTTTHHHHK......",
        ".......KK.KKTTTTJTTTTHHHHK......",
        "...........KTTTTJJJJSKHHK.......",
        "...........KTTTTJJJJSKKK........",
        "...........KPPPPPPPPSK..........",
        "...........KPPPPPPPPSK..........",
        "..........KPPPPPPPPPSK..........",
        "..........KPPPPPPPPPK...........",
        "...........KSBKKCBBSK...........",
        "...........KSKKKKBBSK...........",
        "...........KKKKKKBSSK...........",
        "..........KSSKKKKBSK............",
        "..........KSBKKKBBSK............",
        "..........KSBBCCBBSK............",
        "..........KSBCCCBSK.............",
        "..........KSBCCBBSK.............",
        "..........KSBCCBSSK.............",
        "..........KSBCCBSK..............",
        "..........KSCCCSSK.............."
      ]
    },
    tuck3: {
      palette: { K: "#0a0d18", S: "#1b6fd0", B: "#3aa0ff", C: "#bfe9ff", H: "#d19a5c", M: "#f2d9b6", N: "#5c3416", T: "#28e0c0", J: "#14a08a", P: "#2b3550" },
      rows: [
        "................................",
        "................................",
        "...........K....................",
        "..........KNK...................",
        ".........KNNK...................",
        ".........KNNNK..................",
        "..........KNNK...K..............",
        "..........KNHK..KHK.............",
        "..........KHNHKKHNHK............",
        "..........KHHHHHHHHSK...........",
        "..........KHHHHHHHCCSK..........",
        "..........KHKHHHKHHCSK..........",
        ".........KKHKMMMKHHCSK..........",
        "........KHHHHNNNMHHBSK..........",
        ".......KHHHHMMNMMHHBSKKK........",
        ".......KHHHHHMMMMHTTTHHHK.......",
        "........KHHTTMMMMTTTHHHHK.......",
        ".........KKTTTTTJJJTTHHHK.......",
        "...........KTTTTJJJJSKKK........",
        "...........KTTTTJJJPSK..........",
        "...........KPPPPPPPPK...........",
        "..........KPPPPPPPPPK...........",
        "...........KSKKKKBBSK...........",
        "...........KKKKKKBSSK...........",
        "..........KSSKKKKBSK............",
        "..........KSBKKKBBSK............",
        "..........KSBBCCBBSK............",
        "..........KSBCCCBSK.............",
        "..........KSBCCBBSK.............",
        "..........KSBCCBSSK.............",
        "..........KSBCCBSK..............",
        "..........KSCCCSSK.............."
      ]
    },
    pose4: {
      palette: { K: "#0a0d18", S: "#1b6fd0", B: "#3aa0ff", C: "#bfe9ff", H: "#d19a5c", M: "#f2d9b6", N: "#5c3416", T: "#28e0c0", J: "#14a08a", P: "#2b3550" },
      rows: [
        "................................",
        ".............KK...KK............",
        "............KHHK.KHHK...........",
        "........K...KNHKKKHNK...........",
        ".......KNK.KHHHHHHHHHK..........",
        ".......KNNK.KHHHHHHHK...........",
        ".......KNNK.KHKHHHKHK...........",
        ".......KNNNKKHKMMMKHK...........",
        ".......KNNNKKHMNNNMHK...........",
        "........KNNHKHMMNMMHK...........",
        "........KHHHHKMMMMMKK..KK.......",
        ".......KHHHHTTTMMMJJJKKHHK......",
        "......KHHHHTTTTTTTTTTTHHHHK.....",
        "......KHHHHTTTTTTTTTTTHHHHK.....",
        ".......KHHKKTTTTTJJJJKKHHK......",
        "........KK.KHTTTTJJJJK.KK.......",
        "...........KSTTTTJJJK...........",
        "...........KSPPPPPPPK...........",
        "...........KPPPPPPPPPK..........",
        "...........KPPPPPPPPPK..........",
        "...........KPPPPPPPPPK..........",
        "...........KSBBCKBBSK...........",
        "...........KSBKKKKKSK...........",
        "...........KSBKKKKKSK...........",
        "...........KSBKKKKKSK...........",
        "...........KSBBKKKBSK...........",
        "...........KSBBCCBBSK...........",
        "...........KSSBCCBSSK...........",
        "...........KSSBCCBSSK...........",
        "............KSBCCBSK............",
        "............KSBCCBSK............",
        "............KSBCCBSK............"
      ]
    },
    tuck4: {
      palette: { K: "#0a0d18", S: "#1b6fd0", B: "#3aa0ff", C: "#bfe9ff", H: "#d19a5c", M: "#f2d9b6", N: "#5c3416", T: "#28e0c0", J: "#14a08a", P: "#2b3550" },
      rows: [
        "................................",
        "................................",
        "................................",
        ".........K......................",
        "........KNK.....................",
        ".......KNNK.....................",
        "........KNNK.KK...KK............",
        "........KNNKKHHK.KHHK...........",
        "........KNNNKNHKKKHNK...........",
        "........KNNNHHHHHHHHHK..........",
        ".........KNNHHHHHHHHK...........",
        ".........KHHHHKHHHKHK...........",
        "..........KHHHKMMMKHK...........",
        ".........KKHHHMNNNMHKKKK........",
        "........KHHHHHMMNMMHKHHHK.......",
        "........KHHHTTMMMMMTTHHHK.......",
        "........KHHHTTTMMMTTTHHHK.......",
        ".........KHKTTTTTJJJJKHK........",
        "..........KKTTTTTJJJJKK.........",
        "...........KSTTTTJJJK...........",
        "...........KPPPPPPPPPK..........",
        "...........KPPPPPPPPPK..........",
        "...........KSBKKKKKSK...........",
        "...........KSBKKKKKSK...........",
        "...........KSBKKKKKSK...........",
        "...........KSBBKKKBSK...........",
        "...........KSBBCCBBSK...........",
        "...........KSSBCCBSSK...........",
        "...........KSSBCCBSSK...........",
        "............KSBCCBSK............",
        "............KSBCCBSK............",
        "............KSBCCBSK............"
      ]
    },
    pose5: {
      palette: { K: "#0a0d18", S: "#1b6fd0", B: "#3aa0ff", C: "#bfe9ff", H: "#d19a5c", M: "#f2d9b6", N: "#5c3416", T: "#28e0c0", J: "#14a08a", P: "#2b3550" },
      rows: [
        "................................",
        "..............KK...KK...........",
        ".............KHHK.KHHK..........",
        ".............KNHKKKHNK..........",
        "............KHHHHHHHHHK.........",
        "......KK.....KHHHHHHHK..........",
        ".....KNNK....KHKHHHKHK..........",
        ".....KNNNK...KHKMMMKHK..........",
        "......KNNK..KKHMNNNMHK..........",
        "......KNNNKKSSHMMNMMHK..KK......",
        ".......KNNHSCCSMMMMMKKKKHHK.....",
        ".......KNNHHCTTTMMMTTTTHHHHK....",
        "........KHHTTTTTTTTTTTTHHHHK....",
        ".......KHHHHTTTTTTTTTTTKHHK.....",
        ".......KHHHHTTTTTTJJJKK.KK......",
        "........KHHSHTTTTTJJJK..........",
        ".........KKSBTTTTTJJJK..........",
        "..........KSBPPPPPPPPK..........",
        "..........KSBPPPPPPPPK..........",
        "..........KSSPPPPPPPPPK.........",
        "...........KSPPPPPPPPPK.........",
        "...........KSBBCCKKSKK..........",
        "...........KSBBCKKKK............",
        "...........KSSBCKKKKK...........",
        "............KSBBKKKKSK..........",
        "............KSBBCKKKSK..........",
        "............KSBBCCBBSK..........",
        ".............KSBCCCBSK..........",
        ".............KSBBCCBSK..........",
        ".............KSSBCCBSK..........",
        "..............KSBCCBSK..........",
        "..............KSSCCCSK.........."
      ]
    },
    tuck5: {
      palette: { K: "#0a0d18", S: "#1b6fd0", B: "#3aa0ff", C: "#bfe9ff", H: "#d19a5c", M: "#f2d9b6", N: "#5c3416", T: "#28e0c0", J: "#14a08a", P: "#2b3550" },
      rows: [
        "................................",
        "................................",
        "................................",
        "................................",
        "................................",
        "......KK........................",
        ".....KNNK......K....K...........",
        "......KNNK....KHK..KHK..........",
        "......KNNNK.KKHNHKKHNHK.........",
        ".......KNNNKSSHHHHHHHHK.........",
        ".......KNNNSCCSHHHHHHK..........",
        "........KNHHCCHHKHHHKHK.........",
        "........KHHHHCHHKMMMKHKK........",
        ".........KHHHHHHMNNNHHHHK.......",
        ".........KHHHHHMMMNMMHHHHK......",
        "........KHHHTTTHMMMMHHHHHK......",
        "........KHHHTTTTMMMMTTHHK.......",
        "........KHHHTTTTTTJJJJKK........",
        ".........KKSBTTTTTJJJK..........",
        "..........KSSPTTTTJJJK..........",
        "...........KSPPPPPPPPK..........",
        "...........KSPPPPPPPPPK.........",
        "...........KSBBCKKKKKK..........",
        "...........KSSBCKKKKK...........",
        "............KSBBKKKKSK..........",
        "............KSBBCKKKSK..........",
        "............KSBBCCBBSK..........",
        ".............KSBCCCBSK..........",
        ".............KSBBCCBSK..........",
        ".............KSSBCCBSK..........",
        "..............KSBCCBSK..........",
        "..............KSSCCCSK.........."
      ]
    },
    pose6: {
      palette: { K: "#0a0d18", S: "#1b6fd0", B: "#3aa0ff", C: "#bfe9ff", H: "#d19a5c", M: "#f2d9b6", N: "#5c3416", T: "#28e0c0", J: "#14a08a", P: "#2b3550" },
      rows: [
        "................................",
        "...............KK...KK..........",
        "..............KHHK.KHHK.........",
        "..............KNHKKKHNK.........",
        "..............KHHHHHHHHK........",
        "..............KHHHHHHHK.........",
        "..............KHKHHHKHK.........",
        ".....KK.......KHKMMMKHK.........",
        "....KNNK......KHMNNNMHK..K......",
        "....KNNNK.K...KHMMNMMHKKKHK.....",
        ".....KNNNKSKK.KKMMMMMKKTHHHK....",
        ".....KNNNHCCSKTTTMMMTTTTHHHK....",
        "......KNNHHCCSTTTTTTTTTTTHHK....",
        ".......KHHHHTTTTTTTTTJKKKKK.....",
        "........KHHHHTTTTTTJJJK.........",
        "........KHHHHTTTTTTJJJK.........",
        "........KSHHHHTTTTTJJJK.........",
        "........KSSBCHPPPPPPPPK.........",
        ".........KSBBCPPPPPPPPK.........",
        ".........KSSBCPPPPPPPPK.........",
        "..........KSBBPPPPPPPPK.........",
        "..........KSSBCCCBKKKK..........",
        "...........KSBBCCCKKKK..........",
        "...........KSSBBCKKKKK..........",
        "............KSBBCCKKKK..........",
        "............KSSBBCCKKSK.........",
        ".............KSSBCCCBSSK........",
        "..............KSBBCCBBSK........",
        "..............KSSBCCCBSK........",
        "...............KSSBCCCCK........",
        "................KSSBCCCSK.......",
        ".................KSCCCCSK......."
      ]
    },
    tuck6: {
      palette: { K: "#0a0d18", S: "#1b6fd0", B: "#3aa0ff", C: "#bfe9ff", H: "#d19a5c", M: "#f2d9b6", N: "#5c3416", T: "#28e0c0", J: "#14a08a", P: "#2b3550" },
      rows: [
        "................................",
        "................................",
        "................................",
        "................................",
        "................................",
        "................................",
        "................K....KK.........",
        ".....KK........KHK..KHHK........",
        "....KNNK.......KNHKKKHNK........",
        "....KNNNK.K...KHHHHHHHHK........",
        ".....KNNNKSKK..KHHHHHHHK........",
        ".....KNNNNCCSK.KHKHHHKHK........",
        "......KNNNHCCSKHHKMMMKHK........",
        ".......KHHHHBSSHHMNNNMHHK.......",
        "........KHHHHHSSHMMNMMHHHK......",
        "........KSHHHHTTTMMMMMHHK.......",
        "........KSHHHTTTTTMMMJJK........",
        "........KHHHHTTTTTTJJJK.........",
        ".........KHHHHTTTTTJJJK.........",
        ".........KSSBCTTTTTJJJK.........",
        "..........KSBBPPPPPPPPK.........",
        "..........KSSBPPPPPPPPK.........",
        "...........KSBBCCCKKKK..........",
        "...........KSSBBCKKKKK..........",
        "............KSBBCCKKKK..........",
        "............KSSBBCCKKSK.........",
        ".............KSSBCCCBSSK........",
        "..............KSBBCCBBSK........",
        "..............KSSBCCCBSK........",
        "...............KSSBCCCCK........",
        "................KSSBCCCSK.......",
        ".................KSCCCCSK......."
      ]
    },
    pose7: {
      palette: { K: "#0a0d18", S: "#1b6fd0", B: "#3aa0ff", C: "#bfe9ff", H: "#d19a5c", M: "#f2d9b6", N: "#5c3416", T: "#28e0c0", J: "#14a08a", P: "#2b3550" },
      rows: [
        "................................",
        "................KK...KK.........",
        "...............KHHK.KHHK........",
        "...............KNHKKKHNK........",
        "..............KHHHHHHHHHK.......",
        "...............KHHHHHHHK........",
        "...............KHKHHHKHK........",
        "..............KHHKMMMKHK.KK.....",
        "...............KHMNNNMHKKHHK....",
        "....K..........KHMMNMMHKHHHHK...",
        "...KNK.........KKMMMMMTTHHHHK...",
        "...KNNKKKK....KTTTMMMTTTTHHK....",
        "...KNNNNSSKK..KTTTTTTTTKKKK.....",
        "....KNNNNHSSKKTTTTTTTJJK........",
        ".....KNNNHHHHTTTTTTTJJJK........",
        ".....KSHHHHHHHTTTTTTJJJK........",
        "......KSBHHHHHHTTTTTJJJK........",
        "......KSSBHHHHKPPPPPPPPK........",
        ".......KSBBCCHKPPPPPPPPK........",
        "........KSBBCCCPPPPPPPPK........",
        "........KSSBBCCPPPPPPPPK........",
        ".........KSSBBCCCBBKKKK.........",
        "..........KSSBBCCCBKKKK.........",
        "...........KSSBBCCCKKKK.........",
        "............KSSBBCCCKKKK........",
        ".............KSSBBCCCBBSK.......",
        "..............KSSBBCCCBSSK......",
        "...............KSSBBCCCBSK......",
        "................KSSBBCCCCSK.....",
        ".................KKSSBCCCSK.....",
        "...................KSSCCCSK.....",
        "....................KKSSSK......"
      ]
    },
    tuck7: {
      palette: { K: "#0a0d18", S: "#1b6fd0", B: "#3aa0ff", C: "#bfe9ff", H: "#d19a5c", M: "#f2d9b6", N: "#5c3416", T: "#28e0c0", J: "#14a08a", P: "#2b3550" },
      rows: [
        "................................",
        "................................",
        "................................",
        "................................",
        "................................",
        "................................",
        ".................KK....K........",
        "................KHHK..KHK.......",
        "................KHNKKKHNK.......",
        "....K...........KHHHHHHHHK......",
        "...KNK..........KHHHHHHHK.......",
        "..KNNNKKKK......KHKHHHKHK.......",
        "...KNNNSSSKK....KHKMMMKHHK......",
        "....KNNNNCSSK...KHMNNNMHHK......",
        ".....KNNNHHSSKK.KHMMNMMHHK......",
        ".....KSHHHHHHSSKTTMMMMMHK.......",
        "......KSHHHHHHTTTTTMMMJK........",
        "......KSSBHHHTTTTTTTJJJK........",
        ".......KSBHHHTTTTTTTJJJK........",
        "........KSHHHHHTTTTTJJJK........",
        "........KSSBBCHPPPPPPPPK........",
        ".........KSSBBCPPPPPPPPK........",
        "..........KSSBBCCCBKKKK.........",
        "...........KSSBBCCCKKKK.........",
        "............KSSBBCCCKKKK........",
        ".............KSSBBCCCBBSK.......",
        "..............KSSBBCCCBSSK......",
        "...............KSSBBCCCBSK......",
        "................KSSBBCCCCSK.....",
        ".................KKSSBCCCSK.....",
        "...................KSSCCCSK.....",
        "....................KKSSSK......"
      ]
    },
    pose8: {
      palette: { K: "#0a0d18", S: "#1b6fd0", B: "#3aa0ff", C: "#bfe9ff", H: "#d19a5c", M: "#f2d9b6", N: "#5c3416", T: "#28e0c0", J: "#14a08a", P: "#2b3550" },
      rows: [
        "................................",
        ".................K....K.........",
        "................KHK..KHK........",
        "...............KHNHKKHNHK.......",
        "...............KHHHHHHHHK.......",
        "................KHHHHHHHK.......",
        "...............KHHKHHHKHKKK.....",
        "...............KHHKMMMKHKHHK....",
        "...............KHHMNNNMHHHHHK...",
        "................KHMMNMMHHHHHK...",
        "...............KKHMMMMHTTHHK....",
        "..............KTTTTMMTTTTKK.....",
        "...K..........KTTTTTTTTJK.......",
        "..KNKKKK......KTTTTTTJJJK.......",
        "..KNNNSSKKKKKKTTTTTTJJJJK.......",
        "..KNNNNNHSSSHHTTTTTTJJJK........",
        "...KSNNNHHHHHHHTTTTTJJJK........",
        "....KCNNHHHHHHHPPPPPPPPK........",
        "....KSCBHHHHHHKPPPPPPPPPK.......",
        ".....KSSBCCHHHKPPPPPPPPPK.......",
        "......KSSBBCCCCPPPPPPPPPK.......",
        ".......KSSBBBCCCCBBBKKKKK.......",
        "........KSSSBBBCCCCBKKKKK.......",
        ".........KKSSBBBCCCCKKKKSK......",
        "...........KSSSBBBCCCCCBSSK.....",
        "............KKSSSBBBCCCCBCSK....",
        "..............KKSSSBBBCCCCCK....",
        "................KKSSSBBCCCCSK...",
        "..................KKSSSCCCCK....",
        "....................KKKKSSK.....",
        "........................KK......",
        "................................"
      ]
    },
    tuck8: {
      palette: { K: "#0a0d18", S: "#1b6fd0", B: "#3aa0ff", C: "#bfe9ff", H: "#d19a5c", M: "#f2d9b6", N: "#5c3416", T: "#28e0c0", J: "#14a08a", P: "#2b3550" },
      rows: [
        "................................",
        "................................",
        "................................",
        "................................",
        "................................",
        "................................",
        "..................KK...KK.......",
        ".................KHHK.KHHK......",
        ".................KNHKKKHNK......",
        ".................KHHHHHHHHK.....",
        ".................KHHHHHHHK......",
        ".................KHKHHHKHK......",
        ".................KHKMMMKHK......",
        "..KKK.KK.........KHMNNNMHK......",
        ".KNNNKSSKKKK.....KHMMNMMHK......",
        "..KNNNNCCSSSKK.KKTTMMMMMK.......",
        "...KNNNNHHBSSSKTTTTTMMMJK.......",
        "....KNNNHHHHHHTTTTTTJJJJK.......",
        "....KSCHHHHHHTTTTTTTJJJK........",
        ".....KSSBHHHHHTTTTTTJJJK........",
        "......KSSBBHHHHPPPPPPPPK........",
        ".......KSSBHHCHPPPPPPPPPK.......",
        "........KSSSBBBCCCCBKKKKK.......",
        ".........KKSSBBBCCCCKKKKSK......",
        "...........KSSSBBBCCCCCBSSK.....",
        "............KKSSSBBBCCCCBCSK....",
        "..............KKSSSBBBCCCCCK....",
        "................KKSSSBBCCCCSK...",
        "..................KKSSSCCCCK....",
        "....................KKKKSSK.....",
        "........................KK......",
        "................................"
      ]
    },
    netscape: {
      label: "NETSCAPE CRASH",
      palette: { K: "#0a0d18", B: "#101b46", A: "#3f7ad6", W: "#e8ecff" },
      rows: [
        "..KKBBBBBBBBBBBBBBBBBBBBBBBBKK..",
        ".KBBBBBBBBBBBBBBBBBBBBBBBBBBBBK.",
        "KBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBK",
        "KBBBBBBBBBBBBBBBWBBBBBBBBBBBBBBK",
        "BBBBBBBBWWWBBBBBBBBBBBBWBBBBBBBB",
        "BBBBBWWWWWWWBBBBBBBBBBWWWWBBBBBB",
        "BBBBBBWWWWWWBBBBBBBBBBWWWWBBBBBB",
        "BBBBBBWWWWWWWBBBBBBBBBWWWWWBBBBB",
        "BBBBBBWWWWWWWWBBBBBBBBWWWWBBBBBB",
        "BBBBBBWWWWWWWWWBBBBBBBWWWWBBBBBB",
        "BBBBBBWWWWWWWWWWBBBBBBWWWWBBBBBB",
        "BBBBBBWWWWBWWWWWWBBBBBWWWWBBBBBB",
        "BBBBBBWWWWBWWWWWWBBBBBWWWWBBBBBB",
        "BBBBBBWWWWBBWWWWWWBBBBWWWWBBBBBB",
        "BBBBBBWWWWBBBWWWWWWBBBWWWWBBBBBB",
        "BBBBBBWWWWBBBBWWWWWWBBWWWWBBBBBB",
        "BBBBBBWWWWBBBBBWWWWWWBWWWWBBBBBB",
        "BBBBBBWWWWBBBBBWWWWWWBWWWWBBBBBB",
        "BBBBBBWWWWBBBBBBWWWWWWWWWWBBBBBB",
        "BBBBBBWWWWBBBBBBBWWWWWWWWWBBBBBB",
        "BBBBBBWWWWBBBBBBBBWWWWWWWWBBBBBB",
        "BBBBBBWWWWBBBBBBBBBWWWWWWWBBBBBB",
        "BBBBBBWWWWBBBBBBBBBBWWWWWWBBBBBB",
        "BBBBBBWWWWBBAAAAAAAAWWWWWWBBBBBB",
        "BBBBBBBBBAAAAAAAAAAAAWWWBBBBBBBB",
        "BBBBBBBAAAAAAAAAAAAAAAAAABBBBBBB",
        "BBBBBAAAAAAABBBBBBBBAAAAAAABBBBB",
        "BBBBAAAAABBBBBBBBBBBBBBAAAAABBBB",
        "KBAAAAABBBBBBBBBBBBBBBBBBAAAAABK",
        "KAAAABBBBBBBBBBBBBBBBBBBBBBAAAAK",
        "KAAABBBBBBBBBBBBBBBBBBBBBBBBAAAK",
        "KAKKBBBBBBBBBBBBBBBBBBBBBBBBKKAK"
      ]
    },
    aol: {
      label: "AOL FREE TRIAL",
      palette: { K: "#0a0d18", S: "#c9d4e6", D: "#7a8299", B: "#2b6ef6", W: "#ffffff" },
      rows: [
        ".............KKKKKKK............",
        "..........KKKDDDDDDDKKK.........",
        "........KKDDDDDDDDDDDDDKK.......",
        ".......KDDDDDSSSSSSSDDDDDK......",
        "......KDDDSSSBBBBBBBSSSDDDK.....",
        ".....KDDDSBWWWBWWWBWBBBSDDDK....",
        "....KDDSSBBWBWBWBWBWBBBBSSDDK...",
        "...KDDSSBBWWWWBWBWBWBBBBBSSDDK..",
        "..KDDDSBBWBWBWBWBWBWBBBBBBSDDDK.",
        "..KDDSBBWWBWWWBWWWBWWWBBBBBSDDK.",
        ".KDDSBBWWBBWBBBBBBBBBBBBBBBBSDDK",
        ".KDDSBBWBBWWBBDDDDDBBBBBBBBBSDDK",
        ".KDDSBWBBWWBDDSSSSSDDBBBBBBBSDDK",
        "KDDSBBBBBWBBDSSSKSSSDBBBBBBBBSDD",
        "KDDSBBBBWBBDSSKK.KKSSDBBBBBBBSDD",
        "KDDSBBBBBBBDSSK...KSSDBBBBBBBSDD",
        "KDDSBBBBBBBDSK.....KSDBBBBBBBSDD",
        "KDDSBBBBBBBDSSK...KSSDBBBBBBBSDD",
        "KDDSBBBBBBBDSSKK.KKSSDBBBBBBBSDD",
        "KDDSBBBBBBBBDSSSKSSSDBBBBBBBBSDD",
        ".KDDSBBBBBBBDDSSSSSDDBBBBBBBSDDK",
        ".KDDSBBBBBBBBBDDDDDBBBBBBBBBSDDK",
        ".KDDSBBBBWWWBWWWBWWWBWWWBBBBSDDK",
        "..KDDSBBBWBBBWBWBWBBBWBBBBBSDDK.",
        "..KDDDSBBWWWBWWWBWWWBWWWBBSDDDK.",
        "...KDDSSBWBBBWWBBWBBBWBBBSSDDK..",
        "....KDDSSWBBBWBWBWWWBWWWSSDDK...",
        ".....KDDDSBBBBBBBBBBBBBSDDDK....",
        "......KDDDSSSBBBBBBBSSSDDDK.....",
        ".......KDDDDDSSSSSSSDDDDDK......",
        "........KKDDDDDDDDDDDDDKK.......",
        "..........KKKDDDDDDDKKK........."
      ]
    },
    icq: {
      label: "UH OH!",
      palette: { K: "#0a0d18", R: "#ef4136", D: "#8f1f18", W: "#ffe8e6", Y: "#ffcc33" },
      rows: [
        "...............KKK..............",
        "..............KYYYK.............",
        ".............KYYYYYK............",
        ".............KYYYYYK............",
        "..............KYYYK.............",
        "...............KDK..............",
        "...............KDK..............",
        "...............KDK..............",
        "........KKKKK..KDK..KKKKK.......",
        "......KKRRRRRKKKDKKKRRRRRKK.....",
        ".....KRRRRRRRRRKDKRRRRRRRRRK....",
        ".....KRRRRRRRRRKDKRRRRRRRRRK....",
        "....KRRRRRRRRRRRDRRRRRRRRRRRK...",
        "....KRRRRRRRRRRRRRRRRRRRRRRRK...",
        "....KRRRRRRRRRRRRRRRRRRRRRRRK...",
        "....KRRRRRRRRRRRRRRRRRRRRRRRK...",
        "....KRRRRRRRRRRRWRRRRRRRRRRRK...",
        ".....KRRRRRRRRWWWWWRRRRRRRRK....",
        ".....KRRRRRRRRWDDDWRRRRRRRRK....",
        "......KKRRRRRWWDDDWWRRRRRKK.....",
        ".....KRRRRRRRRWDDDWRRRRRRRRK....",
        ".....KRRRRRRRRWWWWWRRRRRRRRK....",
        "....KRRRRRRRRRRRWRRRRRRRRRRRK...",
        "....KRRRRRRRRRRRRRRRRRRRRRRRK...",
        "....KRRRRRRRRRRRRRRRRRRRRRRRK...",
        "....KRRRRRRRRRRRRRRRRRRRRRRRK...",
        "....KRRRRRRRRRRRKRRRRRRRRRRRK...",
        ".....KRRRRRRRRRK.KRRRRRRRRRK....",
        ".....KRRRRRRRRRK.KRRRRRRRRRK....",
        "......KKRRRRRKK...KKRRRRRKK.....",
        "........KKKKK.......KKKKK.......",
        "................................"
      ]
    },
    winamp: {
      label: "IT WHIPS THE LLAMA",
      palette: { K: "#0a0d18", D: "#39405c", T: "#6a76a0", L: "#141008", E: "#186b25", Y: "#ffcc33", R: "#ff3355", S: "#20263a" },
      rows: [
        "................................",
        "................................",
        "................................",
        ".KKKKKKKKKKKKKKKKKKKKKKKKKKKKKK.",
        "KDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDK",
        "DTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTD",
        "DTTTTTTTTTTTTTTTTTTTTTTTYYTRRTTD",
        "DTTTTTTTTTTTTTTTTTTTTTTTYYTRRTTD",
        "DTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTD",
        "DDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDD",
        "DDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDD",
        "DDLLLLLLLLLLLLLDDDDDDDDDDDDDDDDD",
        "DDLLLLLLLLLLLLLDDDDDDDDRDDDDDDDD",
        "DDLYLYLYYYLYYYLDDDDDDDDYDDDRDDDD",
        "DDLYYYLYLYLLLYLDDDDRDDDYDDDYDDDR",
        "DDLYYYLYYYLYYYLDDDDYDDDYDYDYDDDY",
        "DDLYLYLYLLLLLYLDDDDYDYDYDYDYDDDY",
        "DDLYLYLYLLLYYYLDDYDYDYDYDYDYDYDY",
        "DDLLLLLLLLLLLLLDDYDYDYDYDYDYDYDY",
        "DDLLLLLLLLLLLLLDDEDEDEDEDEDEDEDE",
        "DDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDD",
        "DDDDYYYDDDDDDDDDDDDDDDDDDDDDDDDD",
        "DDSSYYYSSSSSSSSSSSSSSSSSSSSSSSDD",
        "DDSSYYYSSSSSSSSSSSSSSSSSSSSSSSDD",
        "DDDDYYYDDDDDDDDDDDDDDDDDDDDDDDDD",
        "DDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDD",
        "DDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDD",
        "KDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDK",
        ".KKKKKKKKKKKKKKKKKKKKKKKKKKKKKK.",
        "................................",
        "................................",
        "................................"
      ]
    },
    notfound: {
      label: "404 NOT FOUND",
      palette: { K: "#0a0d18", W: "#e8ecff", D: "#8b8fa8", R: "#ff3355" },
      rows: [
        "................................",
        "...KKKKKKKKKKKKKKKKKKKKKKKKKKK..",
        "..KWWWWWWWWWWWWWWWWWWWWDDDDDDDK.",
        "..KWWWWWWWWWWWWWWWWWWWWWDDDDDDK.",
        "..KWWWWWWWWWWWWWWWWWWWWWWDDDDDK.",
        "..KWWWWWWWWWWWWWWWWWWWWWWWDDDDK.",
        "..KWWWWWWWWWWWWWWWWWWWWWWWWDDDK.",
        "..KWWWWWWWWWWWWWWWWWWWWWWWWWDDK.",
        "..KWWWWWWWWWWWWWWWWWWWWWWWWWWK..",
        "..KWWRRWWRRWWRRRRRRWWRRWWRRWWK..",
        "..KWWRRWWRRWWRRRRRRWWRRWWRRWWK..",
        "..KWWRRWWRRWWRRWWRRWWRRWWRRWWK..",
        "..KWWRRWWRRWWRRWWRRWWRRWWRRWWK..",
        "..KWWRRRRRRWWRRWWRRWWRRRRRRWWK..",
        "..KWWRRRRRRWWRRWWRRWWRRRRRRWWK..",
        "..KWWWWWWRRWWRRWWRRWWWWWWRRWWK..",
        "..KWWWWWWRRWWRRWWRRWWWWWWRRWWK..",
        "..KWWWWWWRRWWRRRRRRWWWWWWRRWWK..",
        "..KWWWWWWRRWWRRRRRRWWWWWWRRWWK..",
        "..KWWWWWWWWWWWWWWWWWWWWWWWWWWK..",
        "..KWWWWWWWWWWWWWWWWWWWWWWWWWWK..",
        "..KWWWWWWWWWWWWWWWWWWWWWWWWWWK..",
        "..KWWWWDDDDDDDDDDDDDDDDDDWWWWK..",
        "..KWWWWDDDDDDDDDDDDDDDDDDWWWWK..",
        "..KWWWWWWWWWWWWWWWWWWWWWWWWWWK..",
        "..KWWWWWWWWWWWWWWWWWWWWWWWWWWK..",
        "..KWWWWDDDDDDDDDDDDWWWWWWWWWWK..",
        "..KWWWWDDDDDDDDDDDDWWWWWWWWWWK..",
        "..KWWWWWWWWWWWWWWWWWWWWWWWWWWK..",
        "..KWWWWWWWWWWWWWWWWWWWWWWWWWWK..",
        "...KKKKKKKKKKKKKKKKKKKKKKKKKK...",
        "................................"
      ]
    },
    msn: {
      label: "MSN MESSENGER",
      palette: { K: "#0a0d18", B: "#2b9cf6", C: "#54f2ff", D: "#12245e" },
      rows: [
        "................................",
        "................................",
        "................................",
        "...K.........................K..",
        "..KBK......K.........K......KBK.",
        "..KBBK....KDK.......KDK....KBBK.",
        "..KBBBK...KDDK.....KDDK...KBBBBK",
        ".KBBBBBK...KDK.....KDK...KBBBBBK",
        ".KBBBBBBK...KDK...KDK...KBBBBBBK",
        ".KBBBBBBBKK.KDK...KDK.KKBBBBBBBK",
        ".KBBBBBBBBBK.KDK.KDK.KBBBBBBBBBB",
        "KBBBBBBBBBBBKKDDKDDKKBBBBBBBBBBB",
        "KBBBBBBBBBBBBKKDKDKKBBBBBBBBBBBB",
        ".KBBBBBBBBBBBBKDDDKBBBBBBBBBBBBK",
        "..KBBBBBBBBBBBBDDDBBBBBBBBBBBBK.",
        "...KKBBBBBBBBBBDDDBBBBBBBBBBBK..",
        ".....KBBBBBBBBKDDDKBBBBBBBBKK...",
        "......KBBBBKKCCDDDCCKKBBBBK.....",
        ".......KKKKKCCCDDDCCCKKKKK......",
        "........KKCCCCDDDDDCCCCKK.......",
        ".......KCCCCCCDDDDDCCCCCCK......",
        ".....KKCCCCCCCDDDDDCCCCCCCKK....",
        "....KCCCCCCCCCDDDDDCCCCCCCCCK...",
        "....KCCCCCCCCCDDDDDCCCCCCCCCK...",
        ".....KCCCCCCCCCCKCCCCCCCCCCK....",
        ".....KCCCCCCCCCCKCCCCCCCCCCK....",
        "......KCCCCCCCKK.KKCCCCCCCK.....",
        "......KCCCCCCK.....KKCCCCCK.....",
        ".......KCCCKK........KCCCK......",
        "........KKK...........KKK.......",
        "................................",
        "................................"
      ]
    },
    ie: {
      label: "INTERNET EXPLORER",
      palette: { K: "#0a0d18", B: "#2b6ef6", Y: "#ffcc33" },
      rows: [
        "................................",
        "................................",
        "................................",
        "................................",
        "................................",
        "............KKKKKK..............",
        ".........KKKBBBBBBKKK...........",
        "........KBBBBBBBBBBBBK..........",
        ".......KBBBBBBBBBBBBBBKK........",
        "......KBBBBBBBBBBBBBBBBYKKK.....",
        ".....KBBBBBBBBBBBBBBBBBBYYYK....",
        "...KKBBBBBBBBBKKBBBBBBBBBYYYKK..",
        "..KYYBBBBBBBKK..KKBBBBBBBKYYYYK.",
        ".KYYYBBBBBBK......KBBBBBBKKKYYYK",
        ".KYYBBBBBBK........KBBBBBBK.KYYK",
        ".KYKBBBBBBKKKKKKKKKKBBBBBBK..KYK",
        ".KYKBBBBBBBBBBBBBBBBBBBBBBK..KYY",
        ".KYKBBBBBBBBBBBBBBBBBBBBBBK..KYY",
        ".KYKBBBBBBBBBBBBBBBBBBBBBBK..KYK",
        ".KYYBBBBBBKKKKKKKKKKKKKKKK..KYYK",
        ".KYYYBBBBBBK..............KKYYYK",
        "..KYYBBBBBBBKK.........KKKYYYYK.",
        "...KKBBBBBBBBBKK.KKKKKKYYYYYKK..",
        ".....KBBBBBBBBBBKYYYYYYYYYYK....",
        "......KBBBBBBBBBBYYYYYYYKKK.....",
        ".......KBBBBBBBBBKKKKKKK........",
        "........KBBBBBBBBK..............",
        ".........KKKBBBBBK..............",
        "............KKKKK...............",
        "................................",
        "................................",
        "................................"
      ]
    },
    bsod: {
      label: "BLUE SCREEN",
      palette: { K: "#0a0d18", B: "#1438a8", W: "#e8ecff", C: "#8fb4ff" },
      rows: [
        "................................",
        ".KKKKKKKKKKKKKKKKKKKKKKKKKKKKKK.",
        "KBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBK",
        "KBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBK",
        "KBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBK",
        "KBBBBBBBBBWWWWWWWWWWWWBBBBBBBBBK",
        "KBBBBBBBBBWWBBBWBBBWWWBBBBBBBBBK",
        "KBBBBBBBBBWWBWBWBWWWWWBBBBBBBBBK",
        "KBBBBBBBBBWWBWBWBBBWWWBBBBBBBBBK",
        "KBBBBBBBBBWWBWBWWWBWWWBBBBBBBBBK",
        "KBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBK",
        "KBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBK",
        "KBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBK",
        "KBBBWWWWWWWWWWWWWWWWWWWWWWBBBBBK",
        "KBBBWWWWWWWWWWWWWWWWWWWWWWBBBBBK",
        "KBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBK",
        "KBBBWWWWWWWWWWWWWWWWWWWWWWWWWWBK",
        "KBBBWWWWWWWWWWWWWWWWWWWWWWWWWWBK",
        "KBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBK",
        "KBBBWWWWWWWWWWWWWWWWWWBBBBBBBBBK",
        "KBBBWWWWWWWWWWWWWWWWWWBBBBBBBBBK",
        "KBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBK",
        "KBBBWWWWWWWWWWWWWWWWWWWWWWWWBBBK",
        "KBBBWWWWWWWWWWWWWWWWWWWWWWWWBBBK",
        "KBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBK",
        "KBBBWWWWWWWWWWWWWWBBBBBBBBBBBBBK",
        "KBBBWWWWWWWWWWWWWWBBBBBBBBBBBBBK",
        "KBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBK",
        "KBBBWWWWWWWWWWWWWWWWWWWWBBBBBBBK",
        "KBBBWWWWWWWWWWWWWWWWWWWWBBBBBBBK",
        ".KKKKKKKKKKKKKKKKKKKKKKKKKKKKKK.",
        "...KCCCK........................"
      ]
    },
    java: {
      label: "JAVA APPLET",
      palette: { K: "#0a0d18", W: "#e8ecff", D: "#4a2a10", S: "#8b8fa8", R: "#ff3355" },
      rows: [
        "..........K......K....K.........",
        ".........KRK....KRK..KRK........",
        "..........KRK...KRK..KRK........",
        "...........KRK..KRK.KRK.........",
        "...........KRK..KRKKRK..........",
        "...........KRK.KRKKRK...........",
        "...........KRKKRKKRK............",
        "..........KRKKRK.KRK............",
        ".........KRKKRK..KRK............",
        "........KRK.KRK...KRK...........",
        ".......KRK..KRK...KRK...........",
        ".......KRK...KRK...KRK..........",
        "........K.....K.....K...........",
        ".......KKKKKKKKKKKKKKKK.........",
        "......KWWWWWWWWWWWWWWWWK........",
        ".....KWDDDDDDDDDDDDDDDDWKK......",
        ".....KWDDDDDDDDDDDDDDDDWWWKK....",
        ".....KWDDDDDDDDDDDDDDWWWWWWWK...",
        ".....KWWWWWWWWWWWWWWWWWWWWWWK...",
        ".....KWWWWWWWWWWWWWWWWWWKKWWWK..",
        ".....KWWWWWWWWWWWWWWWWWWKKWWWK..",
        ".....KWWWWWWWWWWWWWWWWWWKKWWWK..",
        ".....KWWWWWWWWWWWWWWWWWWWWWWK...",
        ".....KWWWWWWWWWWWWWWWWWWWWWWK...",
        ".....KWWWWWWWWWWWWWWWWWWWWKK....",
        ".....KWWWWWWWWWWWWWWWWWWKK......",
        ".....KWWWWWWWWWWWWWWWWWWK.......",
        ".....KWWWWWWWWWWWWWWWWWWK.......",
        "....KKKWWWWWWWWWWWWWWWWKKK......",
        "...KSSSSSSSSSSSSSSSSSSSSSSK.....",
        "...KSSSSSSSSSSSSSSSSSSSSSSK.....",
        "...KSSSSSSSSSSSSSSSSSSSSSSK....."
      ]
    },
    hitcounter: {
      label: "YOU ARE VISITOR 4201",
      palette: { K: "#0a0d18", D: "#141008", A: "#ffb000", S: "#2b3550" },
      rows: [
        "................................",
        "................................",
        "................................",
        "................................",
        "................................",
        "................................",
        "..KKKKKKKKKKKKKKKKKKKKKKKKKKKK..",
        ".KKKKKKKKKKKKKKKKKKKKKKKKKKKKKK.",
        ".KKKKKKKKKKKKKKKKKKKKKKKKKKKKKK.",
        ".KKSSSSSSSSSSSSSSSSSSSSSSSSSSKK.",
        ".KKDDDDSDDDSDDDSDDDSDDDSDDDDDKK.",
        ".KKDDDDSDDDSDDDSDDDSDDDSDDDDDKK.",
        ".KKDDDDSDDDSDDDSDDDSDDDSDDDDDKK.",
        ".KKDAAASAAASADASAAASAAASDADDDKK.",
        ".KKDADASADASADASDDASADASAADDDKK.",
        ".KKDADASADASAAASAAASADASDADDDKK.",
        ".KKDADASADASDDASADDSADASDADDDKK.",
        ".KKDAAASAAASDDASAAASAAASAAADDKK.",
        ".KKDDDDSDDDSDDDSDDDSDDDSDDDDDKK.",
        ".KKDDDDSDDDSDDDSDDDSDDDSDDDDDKK.",
        ".KKDDDDSDDDSDDDSDDDSDDDSDDDDDKK.",
        ".KKDDDDSDDDSDDDSDDDSDDDSDDDDDKK.",
        ".KKDDDDSDDDSDDDSDDDSDDDSDDDDDKK.",
        ".KKKKKKKKKKKKKKKKKKKKKKKKKKKKKK.",
        ".KKKKKKKKKKKKKKKKKKKKKKKKKKKKKK.",
        "..KKKKKKKKKKKKKKKKKKKKKKKKKKKK..",
        "................................",
        "................................",
        "................................",
        "................................",
        "................................",
        "................................"
      ]
    },
    modem: {
      label: "NO CARRIER",
      palette: { K: "#0a0d18", T: "#d8c9a0", S: "#f0e6c8", D: "#8b8fa8", A: "#ffb000", R: "#ff3355" },
      rows: [
        "................................",
        "..............................KK",
        ".............................KDD",
        "............................K.KD",
        "..........................KKDKDD",
        "........................KKDDK.KK",
        ".......................KDKKK....",
        ".......................KDDK.....",
        "........................KDDKK...",
        ".........................KKDDK..",
        "..KKKKKKKKKKKKKKKKKKKKKKKKKDDK..",
        ".KTTTTTTTTTTTTTTTTTTTTTTDDTTTTK.",
        "KTSSSSSSSSSSSSSSSSSSSSSSSSSSSSTK",
        "KTSSSSSSSSSSSSSSSSSSSSSSSSSSSSTK",
        "KTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTK",
        "KTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTK",
        "KTTTAAATTRRRTTAAATTAAATTRRRTTTTK",
        "KTTTAAATTRRRTTAAATTAAATTRRRTTTTK",
        "KTTTAAATTRRRTTAAATTAAATTRRRTTTTK",
        "KTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTK",
        "KTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTK",
        "KTTDDDDDDDDDDDDTTTTTTTTTTTTTTTTK",
        "KTTDDDDDDDDDDDDTTTTTTTTTTTTTTTTK",
        "KTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTK",
        ".KTTTTTTTTTTTTTTTTTTTTTTTTTTTTK.",
        "..KKKKKKKKKKKKKKKKKKKKKKKKKKKK..",
        "................................",
        "................................",
        "................................",
        "................................",
        "................................",
        "................................"
      ]
    },
    phone: {
      label: "MOM PICKED UP THE PHONE",
      palette: { K: "#0a0d18", D: "#39405c", M: "#8b8fa8", R: "#ff3355" },
      rows: [
        "..........................KRRKKR",
        ".........................KKKRRKK",
        "...................KKK..KRRKKRK.",
        ".................KKDDDKK.KRRKKRK",
        "................KDDDDDDDK.KRKKRK",
        "...............KDDDDDDDDDKKRRKKR",
        "...............KDDDMMMDDDK.KRKKR",
        "..............KDDDMMMMMDDDKKRKKR",
        "..............KDDDMMMMMDDDKKRKKR",
        "..............KDDDMMMMMDDDKKRKKR",
        "..............KDDDDMMMDDDK.KRKKR",
        ".............KDDDDDDDDDDDKKRRKKR",
        "............KDDDDDDDDDDDK.KRKKRK",
        "...........KDDDDDDDDDDKK...K.KRK",
        "..........KDDDDDDDKKKK........K.",
        ".........KDDDDDDDK..............",
        "........KDDDDDDDK...............",
        ".......KDDDDDDDK................",
        "...KKKKDDDDDDDK.................",
        ".KKDDDDDDDDDDK..................",
        "KDDDDDDDDDDDK...................",
        "DDDDDDDDDDDK....................",
        "DDDMMMDDDDK.....................",
        "DDMMMMMDDDK.....................",
        "DDMMMMMDDDK.....................",
        "DDMMMMMDDDK.....................",
        "DDDMMMDDDK......................",
        "DDDDDDDDDK......................",
        "KDDDDDDDK.......................",
        ".KKDDDKK........................",
        "...KKK..........................",
        "................................"
      ]
    },
    guestbook: {
      label: "SIGN MY GUESTBOOK",
      palette: { K: "#0a0d18", W: "#e8ecff", D: "#8b8fa8", Y: "#ffcc33", S: "#ffffff" },
      rows: [
        "................................",
        "............................K...",
        "...........................KSK..",
        "...........................KSSK.",
        "...........................KSSSK",
        "...............KKK.........KYSSS",
        "..........KKKKKDDWKKKKK...KYYSSK",
        "......KKKKWWWWWDDWWWWWWKKKKYYKK.",
        ".KKKKKWWWWWWWWWDDWWWWWWWWWYYKKKK",
        "KWWWWWWWWWWWWWWDDWWWWWWWWWYYWWWW",
        "KWWWWWWWWWWWWWWDDWWWWWWWWYYYWWWW",
        "KWWDDDDDDDDDDWWDDWWDDDDDDYYDDWWW",
        "KWWWWWWWWWWWWWWDDWWWWWWWWYYWWWWW",
        "KWWWWWWWWWWWWWWDDWWWWWWWYYWWWWWW",
        "KWWWWWWWWWWWWWWDDWWWWWWWYYWWWWWW",
        "KWWDDDDDDDDDDWWDDWWDDDDYYYDDDWWW",
        "KWWWWWWWWWWWWWWDDWWWWWWYYWWWWWWW",
        "KWWWWWWWWWWWWWWDDWWWWWWYYWWWWWWW",
        "KWWWWWWWWWWWWWWDDWWWWWYYWWWWWWWW",
        "KWWDDDDDDDDDDWWDDWWDDDYYDDDDDWWW",
        "KWWWWWWWWWWWWWWDDWWWWYYWWWWWWWWW",
        "KWWWWWWWWWWWWWWDDWWWWYYWWWWWWWWW",
        "KWWWWWWWWWWWWWWDDWWWWYYWWWWWWWWW",
        "KWWDDDDDDDDDDWWDDWWDDDDDDDDDDWWW",
        "KWWWWWWWWWWWWWWDDWWWWWWWWWWWWWWW",
        "KWWWWWWWWWWWWWWDDWWWWWWWWWWWWWWW",
        ".KKKKKKKWWWWWWWDDWWWWWWWWKKKKKKK",
        "........KKKKKKKDDKKKKKKKK.......",
        "...............KK...............",
        "................................",
        "................................",
        "................................"
      ]
    },
    jeeves: {
      label: "ASK JEEVES",
      palette: { K: "#0a0d18", W: "#e8ecff", F: "#e8b58a", D: "#5a5f78", R: "#ff3355" },
      rows: [
        "................................",
        "................................",
        "................................",
        "................................",
        ".............KKKKKKK............",
        "............KFFFFFFFK...........",
        "..........KKFFFFFFFFFKK.........",
        ".........KFFFFFFFFFFFFFK........",
        ".........KFFFFFFFFFFFFFK........",
        "........KFFFFFFFFFFFFFFFK.......",
        ".......KFFFFKKKFFFKKKFFFFK......",
        ".......KDDDFKKKFFFKKKFDDDK......",
        "......KDDDDDKKKFFFKKKDDDDDK.....",
        "......KDDDDDFFFFFFFFFDDDDDK.....",
        "......KDDDDDFFFFFFFFFDDDDDK.....",
        ".......KDDDFFFFFFFFFFFDDDK......",
        ".......KFFFFDDDDDDDDDFFFFK......",
        "........KFFFDDDDDDDDDFFFK.......",
        ".........KFFFFFFFFFFFFFK........",
        ".........KFFFFFFFFFFFFFK........",
        "..........KKFFFFFFFFFKK.........",
        "..........KKKFFFFFFFKKK.........",
        ".........KWWWKKKKKKKWWWK........",
        "........KWWWWWKKKKKKWWWWK.......",
        ".......KWWWWRWKKKKKWRWWWWK......",
        ".......KWWWWRRRKKKRRRWWWWK......",
        "......KWWWWWRRRRRRRRRWWWWWK.....",
        ".....KWWWWWWRRRWKKRRRWWWWWWK....",
        "....KWWWWWWWWWWWWWWWWWWWWWWWK...",
        "....KWWWWWWWWWWWWWWWWWWWWWWWK...",
        "...KWWWWWWWWWWWWWWWWWWWWWWWWWK..",
        "....KKKKKKKKKKKKKKKKKKKKKKKKK..."
      ]
    },
    toaster: {
      label: "FLYING TOASTERS",
      palette: { K: "#0a0d18", S: "#c9d4e6", W: "#ffffff", D: "#8b8fa8", E: "#b57a3a", A: "#ffb000" },
      rows: [
        "................................",
        "............KKKKKKKKK...........",
        "...........KAAAAAAAAAK..........",
        "...........KAAAAAAAAAK..........",
        "...........KEEEEEEEEEK..........",
        "...........KEEEEEEEEEK..........",
        "...........KEEEEEEEEEK..........",
        "...........KEEEAEEEEEK..........",
        "...........KEEEEEEEEEK..........",
        "KK.........KEEEEEEAEEK.........K",
        "WWKKK.....KKEEEEEEEEEKK......KKW",
        "WWWWWKK..KSKKKKKKKKKKKSK..KKKWWW",
        "DDDWWWWKKSSKKKKKKKKKKKSSKKWWWWDD",
        "WWDDDWWWWSWWWWWWWWWWWWSSWWWWDDDW",
        "WWWKWDDDWSWWWWWWWWWWWWSSWDDDWWWW",
        "WWWWWWWDDDSSSSSSSSSSSSSSDWWKWWWW",
        "WDDDWWWDDDSSSSSSSSSSSSSSKWWWWDDD",
        "KKWDDDWDDDSSSSSSSSSSSSSSWWWDDDWK",
        ".KWWWWDDDDSSSSSSSSSSSSSSDDDWWWWK",
        ".KWWWWWWDSSSSSSSSSSSSSSSDWKWWWWK",
        ".KWDDDWWKSSSSSSDDDSSSSSSKWWDDDWK",
        "..KKWDDWWSSSSSDDSDDSSSSSWWDDWKK.",
        "....KKWDDSSSSSDSSSDSSSSSDDWWK...",
        "......KWDSSSSSDDSDDSSSSSDWKK....",
        ".......KKSSSSSSDDDSSSSSSKK......",
        "........KSSSSSSSSSSSSSSSK.......",
        ".........KSSSSSSSSSSSSSK........",
        "..........KKKKKKKKKKKKK.........",
        "................................",
        "................................",
        "................................",
        "................................"
      ]
    },
    hourglass: {
      label: "STILL LOADING",
      palette: { K: "#0a0d18", W: "#e8ecff", S: "#8b8fa8", B: "#2b6ef6" },
      rows: [
        "................................",
        "................................",
        "......KKKKKKKKKKKKKKKKKKKK......",
        ".....KSSSSSSSSSSSSSSSSSSSSK.....",
        ".....KSSSSSSSSSSSSSSSSSSSSK.....",
        ".....KSSSSSSSSSSSSSSSSSSSSK.....",
        "......KKWWWWWWWWWWWWWWWWWK......",
        "........KWWWWWWWWWWWWWWWK.......",
        "........KWBBBBBBBBBBBBBWK.......",
        ".........KWBBBBBBBBBBBWK........",
        "..........KBBBBBBBBBBBK.........",
        "...........KBBBBBBBBBWK.........",
        "...........KWBBBBBBBWK..........",
        "............KWBBBBBWK...........",
        ".............KBBBBBK............",
        ".............KWBBWWK............",
        "..............KBBWK.............",
        "..............KBBWK.............",
        ".............KWBBWWK............",
        "............KWWBBWWWK...........",
        "............KWWBBWWWK...........",
        "...........KWWBBBBBWWK..........",
        "..........KWWBBBBBBBWWK.........",
        ".........KWWWBBBBBBBBWWK........",
        ".........KWWBBBBBBBBBWWK........",
        "......KKKWWWWWWWWWWWWWWWKK......",
        ".....KSSSSSSSSSSSSSSSSSSSSK.....",
        ".....KSSSSSSSSSSSSSSSSSSSSK.....",
        ".....KSSSSSSSSSSSSSSSSSSSSK.....",
        "......KKKKKKKKKKKKKKKKKKKK......",
        "................................",
        "................................"
      ]
    },
    skipintro: {
      label: "SKIP INTRO",
      palette: { K: "#0a0d18", S: "#c9d4e6", W: "#ffffff", D: "#7a8299" },
      rows: [
        "................................",
        "................................",
        "................................",
        "................................",
        "................................",
        "................................",
        "................................",
        "................................",
        "..KKKKKKKKKKKKKKKKKKKKKKKKKKKK..",
        ".KSSSSSSSSSSSSSSSSSSSSSSSSSSSSK.",
        "KSWWWWWWWWWWWWWWWWWWWWWWWWWWWDSK",
        "KSWSSSSSSSSSSSSSSSSSSSSSSSSSSDSK",
        "KSWSSSSSSSSSSSSSSSSSSSSSSSSSSDSK",
        "KSWSSSSKKKSKSKSKKKSKKKSSSSSSSDSK",
        "KSWSSSSKSSSKSKSSKSSKSKSSSSSSSDSK",
        "KSWSSSSKKKSKKSSSKSSKKKSSSSSSSDSK",
        "KSWSSSSSSKSKSKSSKSSKSWSSSSSSSDSK",
        "KSWSSSSKKKSKSKSKKKSKSWWSSSSSSDSK",
        "KSWSSSSSSSSSSSSSSSSSSWWWSSSSSDSK",
        "KSWSSSSSSSSSSSSSSSSSSWWWWSSSSDSK",
        "KSWSSSSSSSSSSSSSSSSSSWWWWWWSSDSK",
        "KSDDDDDDDDDDDDDDDDDDDWWWWWWWDDSK",
        ".KSSSSSSSSSSSSSSSSSSSWWWWWWWWSK.",
        "..KKKKKKKKKKKKKKKKKKKWWWWWWWWWK.",
        "....................KWWWWWWKKK..",
        "....................KWWWWWWK....",
        "....................KWWWWWWWK...",
        "....................KWWKKWWWK...",
        ".....................KK.KWWWWK..",
        ".........................KWWWK..",
        "..........................KKK...",
        "................................"
      ]
    },
    tamagotchi: {
      label: "IT DIED",
      palette: { K: "#0a0d18", P: "#ff6fae", L: "#8ea87a", M: "#1a2414", D: "#c9d4e6" },
      rows: [
        "...............KKK..............",
        "..............KDDDK.............",
        ".............KDDDDDK............",
        "............KDDDKDDDK...........",
        "...........KKDDPPPDDKK..........",
        ".........KKPPDDDPDDDPPKK........",
        "........KPPPPPDDDDDPPPPPK.......",
        ".......KPPPPPPPDDDPPPPPPPK......",
        "......KPLLLLLLLLLLLLLLLLPPK.....",
        ".....KPLLLLLLLLLLLLLLLLLLPPK....",
        "....KPPLLMLLLMLLLMLLLMLLLPPPK...",
        "....KPPLLLMLMLLLLLMLMLLLLPPPK...",
        "...KPPPLLLLMLLLLLLLMLLLLLPPPPK..",
        "...KPPPLLLMLMLLLLLMLMLLLLPPPPK..",
        "...KPPPLLMLLLMLLLMLLLMLLLPPPPK..",
        "...KPPPLLLLLLLLLLLLLLLLLLPPPPK..",
        "..KPPPPLLLLLLLLLLLLLLLLLLPPPPPK.",
        "..KPPPPLLLLLLLLLLLLLLLLLLPPPPPK.",
        "..KPPPPLLLLLMMMMMMMMLLLLLPPPPPK.",
        "..KPPPPLLLLLLLLLLLLLLLLLLPPPPK..",
        "..KPPPPLLLLLLLLLLLLLLLLLLPPPPK..",
        "..KPPPPPLLLLLLLLLLLLLLLLPPPPPK..",
        "..KPPPPPPPPPPPPPPPPPPPPPPPPPPK..",
        "..KPPPPPPPPPPPPPPPPPPPPPPPPPPK..",
        "..KPPPPPPDDDPPPDDDPPPDDDPPPPPK..",
        "..KPPPPPDDDDDPDDDDDPDDDDDPPPPK..",
        "..KPPPPPDDDDDPDDDDDPDDDDDPPPPK..",
        "...KKPPPDDDDDPDDDDDPDDDDDPPPK...",
        ".....KPPPDDDPPPDDDPPPDDDPPPK....",
        "......KPPPPPPPPPPPPPPPPPPPK.....",
        "......KPPPPPPPPPPPPPPPPPPPK.....",
        ".......KPPPPPPPPPPPPPPPPPK......"
      ]
    },
    midi: {
      label: "AUTOPLAYING MIDI",
      palette: { K: "#0a0d18", C: "#54f2ff", W: "#e8ecff" },
      rows: [
        "................................",
        "................................",
        "................................",
        "...........................K....",
        "..........................KWK...",
        "............KKK..........K.KWK..",
        "...........KCCCKK.......KWK.KWK.",
        "...........KCCCCCKK.....KWWK.KWK",
        "...........KCCCCCCCKK..K.KWWKKWK",
        "...........KCCCCCCCCCKKWK.KWK.KW",
        "...........KCCCCCCCCCCCWWKKWWKKW",
        "...........KCCCCCCCCCCCKWK.KWKKW",
        "...........KCCCCCCCCCCCKWK.KWKKW",
        "...........KCCCKCCCCCCCKWK.KWKKW",
        "...........KCCCKKKCCCCCWWKKWWKKW",
        "...........KCCCK..KKCCCWK.KWK.KW",
        "...........KCCCK....KKKK.KWWKKWW",
        "...........KCCCK........KWWK.KWK",
        ".......KKKKKCCCK.........KK.KWWK",
        "......KCCCCCCCCK...........KWWK.",
        ".....KCCCCCCCCCK..........KWWK..",
        "....KCCCCCCCCCCK...........KK...",
        "...KCCCCCCCCCCCK................",
        "...KCCCCCCCCCCCK................",
        "...KCCCCCCCCCCCK................",
        "...KCCCCCCCCCCCK................",
        "...KCCCCCCCCCCCK................",
        "....KCCCCCCCCCK.................",
        ".....KCCCCCCCK..................",
        "......KCCCCCK...................",
        ".......KKKKK....................",
        "................................"
      ]
    },
    hamster: {
      label: "HAMPSTER DANCE",
      palette: { K: "#0a0d18", T: "#d8a860", W: "#f5e6c8", P: "#ff9fb8", D: "#8f6a33" },
      rows: [
        "................................",
        "................................",
        "................................",
        "................................",
        ".....KKKKK.............KKKKK....",
        "....KTTTTTK...........KTTTTTK...",
        "...KTTTTTTTK.KKKKKKK.KTTTTTTTK..",
        "..KTTTPPPTTTKTTTTTTTKTTTPPPTTTK.",
        "..KTTPPPPPTTTTTTTTTTTTTPPPPPTTK.",
        "..KTTPPPPPTTTTTTTTTTTTTPPPPPTTK.",
        "..KTTPPPPTTTTTTTTTTTTTTTPPPPTTK.",
        "..KTTTPPTTTTTTTTTTTTTTTTTPPTTTK.",
        "...KTTTTTTKKKTTTTTTTKKKTTTTTTK..",
        "....KTTTTKWKKKTTTTTKWKKKTTTTK...",
        ".....KTTTKKKKKTTTTTKKKKKTTTK....",
        ".....KTTTKKKKKTTTTTKKKKKTTTK....",
        ".....KTTTTKKKTTTTTTTKKKTTTTK....",
        ".....KTTTTWWWTTWWWTTWWWTTTTK....",
        ".....KTTWWWWWWWPPPWWWWWWWTTK....",
        ".....KTWWWWWWWWPPPWWWWWWWWTK....",
        ".....KTWWWWWWWWPPPWWWWWWWWTK....",
        ".KKKKKWWWWWWWWWDDWWWWWWWWWWKKKKK",
        "KTTTTTWWWWWWWWWDDWWWWWWWWWWTTTTT",
        "KTTTTTWWWWWWWWWDDWWWWWWWWWWTTTTT",
        "KTTTTTKWWWWWWWWWTWWWWWWWWWKTTTTT",
        "KTTTTTKWWWWWWWWWTWWWWWWWWWKTTTTT",
        "KTTTTTKKWWWWWWWTTTWWWWWWWKKTTTTT",
        ".KKKKK..KKWWWTTTTTTTWWWKK..KKKKK",
        "..........KKKKKKKKKKKKK.........",
        "................................",
        "................................",
        "................................"
      ]
    },
    napster: {
      label: "SHARING IS CARING",
      palette: { K: "#0a0d18", B: "#2b6ef6", S: "#c9d4e6", P: "#ff9fb8", W: "#ffffff", D: "#12245e" },
      rows: [
        "................................",
        "................................",
        "........K...............K.......",
        ".......KSK.............KSK......",
        ".......KSSK...........KSSK......",
        ".......KSSSKKKKKKKKKKKKSSK......",
        ".......KSSSBBBBBBBBBBBSSSK......",
        ".......KSSSSBBBBBBBBBSSSSK......",
        "......KSSSPSSBBBBBBBSSPSSSK.....",
        ".....KBSSSPPSSBKKKBBSPPSSSBK....",
        "....KBBSSSPPSSKKKKKSSPPSSSBBK...",
        "....KBBSSSPPPSSSSSSSPPPSSSBBK...",
        "...KBBBSSSPPSSSSSSSSSPPSSSBBBK..",
        "..KBBBBSSPPSSSSSSSSSSSPPSSBBBBK.",
        "..KBBBBSSPSSSSSSSSSSSSSPSSBBBBK.",
        ".KBBBBBSSSSSSSSSSSSSSSSSSSBBBBBK",
        ".KBBBBBSSSSSKSSSSSSSKSSSSBBBBBBK",
        "KBBBBBBBSSSWKKSSSSSWKKSSBBBBBBBK",
        "KBBBBBBBSSKKKKKSSSKKKKKSBBBBBBBK",
        "KBBDDDBBSSSKKKSSSSSKKKSSBBDDDBBK",
        "KBBDDDBBSSSSKSSSSSSSKSSSBBDDDBBK",
        "KBBDDDBBSSSSSSSSSSSSSSSSBBDDDBBK",
        "KBBDDDBBSSSSSSSSSSSSSSSSBBDDDBBK",
        "KBBBBBBBSSSSSSPPPPPSSSSSBBBBBBBK",
        "KBBBBBBBSSSSSSSPPPSSSSSSBBBBBBBK",
        ".KBBBBBKKSSSSSSSSSSSSSSSKBBBBBK.",
        "..KKKKK..KSSSSSSSSSSSSSK.KKKKK..",
        "..........KSSSSSSSSSSSK.........",
        "...........KSSSSSSSSSK..........",
        "............KKKSSSKKK...........",
        "...............KKK..............",
        "................................"
      ]
    },
    y2k: {
      label: "Y2K BUG",
      palette: { K: "#0a0d18", T: "#d8c9a0", S: "#b5a880", R: "#ff3355", L: "#2a1418" },
      rows: [
        "................................",
        "................................",
        "..KKKKKKKKKKKKKKKKKKKKKKKKKKKK..",
        ".KTTTTTTTTTTTTTTTTTTTTTTTTTTTTK.",
        "KTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTK",
        "KTTKKKKKKKKKKKKKKKKKKKKKKKKKKTTK",
        "KTTKLLLLLLLLLLLLLLLLLLLLLLLLKTTK",
        "KTTKKKKKKKKKKKKKKKKKKKKKKKKKKTTK",
        "KTTKKRRKKRRKKRRRRRRKKRRKKRRKKTTK",
        "KTTKLLLLLLLLLLLLLLLLLLLLLLLLKTTK",
        "KTTKKRRKKRRKKKKKKRRKKRRKKRRKKTTK",
        "KTTKKRRKKRRKKKKKKRRKKRRKKRRKKTTK",
        "KTTKLLLLLLLLLLLLLLLLLLLLLLLLKTTK",
        "KTTKKKKRRKKKKRRRRRRKKRRRRKKKKTTK",
        "KTTKKKKRRKKKKRRKKKKKKRRKKRRKKTTK",
        "KTTKLLLLLLLLLLLLLLLLLLLLLLLLKTTK",
        "KTTKKKKRRKKKKRRRRRRKKRRKKRRKKTTK",
        "KTTKKKKRRKKKKRRRRRRKKRRKKRRKKTTK",
        "KTTKLLLLLLLLLLLLLLLLLLLLLLLLKTTK",
        "KTTKKKKKKKKKKKKKKKKKKKKKKKKKKTTK",
        "KTTKKKKKKKKKKKKKKKKKKKKKKKKKKTTK",
        "KTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTK",
        "KTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTK",
        "KTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTK",
        ".KTTTTTTTTTTTTTTTTTTTTTTTTTTTTK.",
        "..KKKKKKKKKKTTTTTTTTKKKKKKKKKK..",
        "...........KTTTTTTTTK...........",
        ".......KKKKKTTTTTTTTKKKKK.......",
        "......KSSSSSSSSSSSSSSSSSSK......",
        "......KSSSSSSSSSSSSSSSSSSK......",
        "......KSSSSSSSSSSSSSSSSSSK......",
        ".......KKKKKKKKKKKKKKKKKK......."
      ]
    },
    imac: {
      label: "BONDI BLUE",
      palette: { K: "#0a0d18", C: "#3fb8c8", L: "#0e1a24", B: "#2b6ef6", S: "#c9d4e6", W: "#a8f4ff" },
      rows: [
        "................................",
        "................................",
        "................................",
        "........KKKKKKKKKKKKKKKK........",
        ".....KKKCCCCCCCCCCCCCCCCKK......",
        "....KWWWCCCCCCCCCCCCCCCCCCK.....",
        "....KWWWCCCCCCCCCCCCCCCCCCCK....",
        "...KCCLLLLLLLLLLLLLLLLLLLLCCK...",
        "...KCCLBBBBBBBBBBBBBBBBBBLCCK...",
        "..KCCCLBBBBBBBBBBBBBBBBBBLCCCK..",
        "..KCCCLBBBBBBBBBBBBBBBBBBLCCCK..",
        "..KCCCLLLLLLLLLLLLLLLLLLLLCCCK..",
        "..KCCCLLLLLLLLLLLLLLLLLLLLCCCK..",
        "..KCCCLLLLLLLLLLLLLLLLLLLLCCCK..",
        "..KCCCLLLLLLLLLLLLLLLLLLLLCCCK..",
        "..KCCCLLLLLLLLLLLLLLLLLLLLCCCK..",
        "..KCCCLLLLLLLLLLLLLLLLLLLLCCCK..",
        "..KCCCLLLLLLLLLLLLLLLLLLLLCCCK..",
        "..KCCCLLLLLLLLLLLLLLLLLLLLCCCK..",
        "..KCCCLLLLLLLLLLLLLLLLLLLLCCCK..",
        "...KCCLLLLLLLLLLLLLLLLLLLLCCK...",
        "...KCCCCCCCCCCCCCCCCCCCCCCCCK...",
        "....KCCCCCCCCCCCCCCCCCCCCCCK....",
        ".....KCCCCCCCCCCCCCCCCCCCCK.....",
        "....KCCCCCCCCCCCCCCCCCCCCCCK....",
        "...KCCCCCCCCCCCCCCCCCCCCCCCCK...",
        "...KCCCCCCSSSSSSSSSSSSCCCCCCK...",
        "...KCCCCCCSSSSSSSSSSSSCCCCCCK...",
        "....KCCCCCCCCCCCCCCCCCCCCCCK....",
        ".....KKKKKKKSSSSSSSSKKKKKKK.....",
        "...........KSSSSSSSSK...........",
        "...........KSSSSSSSSK..........."
      ]
    },
    bonzi: {
      label: "BONZI BUDDY",
      palette: { K: "#0a0d18", P: "#9b5de5", V: "#c9a0ff", W: "#ffffff", D: "#5a2a8f" },
      rows: [
        "................................",
        "................................",
        "................................",
        ".............KKKKKKK............",
        "...........KKPPPPPPPKK..........",
        "..........KPPPPPPPPPPPK.........",
        "........KKPPPPPPPPPPPPPKK.......",
        "....K..KDDDDDDPPPPPDDDDDDK..K...",
        "..KKPKKKDDDDDDPPPPPDDDDDDKKKPKK.",
        ".KPPPPPPPWWWWWPPPPPWWWWWPPPPPPPK",
        "KPPPVPPPWWWKKWWPPPWWWKKWWPPPVPPP",
        "KPPVVVPPWWWKKKWPPPWWWKKKWPPVVVPP",
        "PPVVVVPPWWWKKKWPPPWWWKKKWPPVVVVP",
        "KPPVVVPPPWWWWWPPPPPWWWWWPPPVVVPP",
        "KPPPVPPPPPWWWPVVVVVPWWWPPPPPVPPP",
        ".KPPPPPPPPPPVVVVVVVVVPPPPPPPPPPK",
        "..KKPKPPPPPVVVVVVVVVVVPPPPPKPKK.",
        "....KKPPPPVVVVKVVVVKVVVPPPPKK...",
        "......KPPPVVVKKKVVKKKVVPPPK.....",
        "......KPPVVVVVKVVVVKVVVVPPK.....",
        ".......KPVVVVVVVVVVVVVVVPK......",
        "........KVVVVVVVVVVVVVVVK.......",
        "........KVKWWWWWWWWWWKKVK.......",
        "........KVVWWWWWWWWWWKVVK.......",
        ".........KVKKKKKKKKKKKVK........",
        ".........KVVKKKKKKKKKVVK........",
        "..........KVKKKKKKKKKVK.........",
        "...........KVVVVVVVVVK..........",
        "............KKVVVVVKK...........",
        "..............KKKKK.............",
        "................................",
        "................................"
      ]
    },
    toolbars: {
      label: "SIX TOOLBARS",
      palette: { K: "#0a0d18", S: "#c9d4e6", D: "#7a8299", W: "#e8ecff", M: "#5a5f78", B: "#2b6ef6", R: "#ff3355" },
      rows: [
        "................................",
        ".KKKKKKKKKKKKKKKKKKKKKKKKKKKKKK.",
        "KSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSK",
        "SBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBS",
        "SBBBBBBBBBBBBBBBBBBBBBBBBBBRRRBS",
        "SBBBBBBBBBBBBBBBBBBBBBBBBBBRRRBS",
        "SBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBS",
        "SSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSS",
        "SSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSS",
        "SSMMMSSSMMMSSSMMMSSSMMMSSSMMMSSS",
        "SSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSS",
        "SDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDS",
        "SDWWWDDDWWWDDDWWWDDDWWWDDDWWWDDS",
        "SDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDS",
        "SSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSS",
        "SSMMMSSSMMMSSSMMMSSSMMMSSSMMMSSS",
        "SSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSS",
        "SDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDS",
        "SDWWWDDDWWWDDDWWWDDDWWWDDDWWWDDS",
        "SDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDS",
        "SSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSS",
        "SSMMMSSSMMMSSSMMMSSSMMMSSSMMMSSS",
        "SSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSS",
        "SDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDS",
        "SDWWWDDDWWWDDDWWWDDDWWWDDDWWWDDS",
        "SDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDS",
        "SWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWS",
        "SWWDDDDDDDDDDDDWWWWWWWWWWWWWWWWS",
        "SWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWS",
        "KSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSK",
        ".KKKKKKKKKKKKKKKKKKKKKKKKKKKKKK.",
        "................................"
      ]
    },
    iloveyou: {
      label: "ILOVEYOU",
      palette: { K: "#0a0d18", W: "#e8ecff", S: "#c9d4e6", D: "#8b8fa8", R: "#ff3355" },
      rows: [
        "................................",
        "................................",
        "................................",
        "................................",
        "................................",
        "................................",
        ".KKKKKKKKKKKKKKKKKKKKKKKKKKKKKKK",
        "KSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSS",
        "KWSSSSSSSSSSSSSSSSSSSSSSSSSSSSSK",
        "KWWWSSSSSSSSSSSSSSSSSSSSSSSSSSWK",
        "KWWWWSSSSSSSSSSSSSSSSSSSSSSSWWWK",
        "KWWWWWSSSSSSSSSSSSSSSSSSSSSWWWWK",
        "KWWWWWWSSSSSSSSSSSSSSSSSSSWWWWWK",
        "KWWWWWWWWSSSSSSSSSSSSSSSSWWWWWWK",
        "KWWWWWWWWWSSSSSSSSSSSSSWWWWWWWWK",
        "KWWWWWWWWWWSSSSSSSSSSSWWWWWWWWWK",
        "KWWWWWWWWWWRRRSSSSSRRRWWWWWWWWWK",
        "KWWWWWWWWRRRRRRRSRRRRRRRWWWWWWWK",
        "KWWWWWWWWRRRRRRRSRRRRRRRWWWWWWWK",
        "KWWWWWWWRRRRRRRRRRRRRRRRRWWWWWWK",
        "KWWWWWWDRRRRRRRRRRRRRRRRRDWWWWWK",
        "KWWWWWDDRRRRRRRRRRRRRRRRRDDWWWWK",
        "KWWWWDDWWRRRRRRRRRRRRRRRWWDDWWWK",
        "KWWWDDWWWRRRRRRRRRRRRRRRWWWDDWWK",
        "KWWDDWWWWWWRRRRRRRRRRRWWWWWWDDWK",
        "KWDWWWWWWWWWRRRRRRRRRWWWWWWWWWDK",
        "KDKKKKKKKKKKRRRRRRRRRKKKKKKKKKKD",
        ".K..........KRRRRRRRK..........K",
        ".............KRRRRRK............",
        "..............KRRRK.............",
        "...............KKK..............",
        "................................"
      ]
    },
    sockpuppet: {
      label: "PETS.COM",
      palette: { K: "#0a0d18", W: "#f0f2ff", E: "#a06a3a", S: "#8b8fa8", D: "#5a5f78", M: "#39405c" },
      rows: [
        "................................",
        "................................",
        "...K.......................K....",
        "..KEKK......KKKKKKK.......KEK...",
        "..KEEEK...KKWWWWWWWKK...KKEEK...",
        "..KEEEEKKKWWWWWWWWWWWK.KEEEEK...",
        "..KEEEEEEWWWWWWWWWWWWWKEEEEEEK..",
        ".KEEEEEEWWWWWWWWWWWWWWWEEEEEEK..",
        ".KEEEEEWWWKKKWWWWWKKKWWWEEEEEK..",
        ".KEEEEEWWKWKKKWWWKWKKKWWEEEEEK..",
        ".KEEEEWWWKKKKKWWWKKKKKWWWEEEEEK.",
        ".KEEEEWWWKKKKKWWWKKKKKWWWEEEEEK.",
        ".KEEEEWWWWKKKWWWWWKKKWWWWEEEEEK.",
        "KEEEEEWWWWWWWWWWWWWWWWWWWEEEEEK.",
        "KEEEEEWWWWWWWWWWWWWWWWWWWEEEEEEK",
        "KEEEEEWWWWWWWWWWWWWWWWWWWEEEEEEK",
        "KEEEEEWWWWWWWWWWWWWWWWWWWEEEEEEK",
        ".KEEEEWWWWWWWKKKKKWWWWWWWEEEEEK.",
        "..KEEEWWWWWWWKKKKKWWWWWWWEEEEK..",
        "...KEEWWWWWWWKKKKKWWWWWWWEEEK...",
        "....KKWWWWWWWKKKKKWWWWWWWEKK....",
        ".....KWWWWWWWKDDKKWWWWWWWSSSK...",
        "......KWWWWWWWDDWWWWWWWWSSSSSK..",
        ".......KWWWWWWDDWWWWWWWSSMMMSSK.",
        ".......KWWWWWWDDWWWWWWWSSMMMSSK.",
        ".......KWWWDDDDDDDDDWWWSSMMMSSK.",
        "........KWWWWWWWWWWWWWKKSSSSSK..",
        ".........KWWWWWWWWWWWKKMMSSSK...",
        "..........KWWWWWWWWWK.KMMMKK....",
        "...........KKKWWWKKK.KMMMK......",
        "..............KKK....KMMMK......",
        "....................KMMMK......."
      ]
    },
    popupstorm: {
      label: "POPUP STORM",
      palette: { K: "#0a0d18", G: "#c9d4e6", B: "#12245e", R: "#ff3355", W: "#ffffff", D: "#8b8fa8", Y: "#ffcc33", S: "#e8ecff" },
      rows: [
        "..................................................................KKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKK",
        "..................................................................KBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBK",
        "..KKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKK..........................KBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBRRRRBK",
        "..KBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBK..........................KBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBRRRRBK",
        "..KBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBRRRRBK..........................KBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBRRRRBK",
        "..KBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBRRRRBK..........................KBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBK",
        "..KBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBRRRRBK..........................KGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGK",
        "..KBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBK..........................KGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGK",
        "..KGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGK..........................KGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGK",
        "..KGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGK..........................KGGGDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDGGGK",
        "..KGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGK..........................KGGGDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDGGGK",
        "..KGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGK..........................KGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGK",
        "..KGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGK..........................KGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGK",
        "..KGGGGGRRRRRGGGGDDDDDDDDDDDDDDDDDDGGGGK..........................KGGGDDDDDDDDDDDDDDDDDDDDDDDDDDGGGGGGGK",
        "..KGGGGRRRRRRRGGGDDDDDDDDDDDDDDDDDKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKDDDDDDDDDDDDDDDDDDDDDDDDGGGGGGGK",
        "..KGGGGWWRRRRRGGGGGGGGGGGGGGGGGGGGKBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBKGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGK",
        "..KGGGGWWRRRRRGGGGGGGGGGGGGGGGGGGGKBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBRRRRBKGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGK",
        "..KGGGGWWRRRRRGGGGGGGGGGGGGGGGGGGGKBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBRRRRBKDDDDDDDDDDDDDDDDDDDDDDDDDDDGGGGK",
        "..KGGGGRRRRRRRGGGDDDDDDDDDDDDDDGGGKBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBRRRRBKDDDDDDDDDDDDDDDDDDDDDDDDDDDGGGGK",
        "..KGGGGGRRRRRGGGGDDDDDDDDDDDDDDGGGKBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBKGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGK",
        "..KGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGKGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGKGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGK",
        "..KGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGKGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGKGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGK",
        "..KGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGKGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGKGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGK",
        "..KGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGKGGGYYYYYYYYYYYYYYYYYYYYYYYYYYYYYYGGGKGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGK",
        "..KGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGKGGGYYYYYYYYYYYYYYYYYYYYYYYYYYYYYYGGGKGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGK",
        "..KGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGKGGGYYYYYYYYYYYYYYYYYYYYYYYYYYYYYYGGGKGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGK",
        "..KGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGKGGGYYYYYYYYYYYYYYYYYYYYYYYYYYYYYYGGGKGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGK",
        "..KGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGKGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKK",
        "..KGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGKGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGK................................",
        "..KKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKGGGGGGGGGGGGGGGGGGGGGGGGSSSSSSSSSGGGK................................",
        "..................................KGGGDDDDDDDDDDDDDDDDDDDDDSSSKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKK....",
        "..................................KGGGDDDDDDDDDDDDDDDDDDDDDSSSKBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBK....",
        "..................................KGGGGGGGGGGGGGGGGGGGGGGGGSSSKBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBRRRRBK....",
        "..................................KGGGGGGGGGGGGGGGGGGGGGGGGSSSKBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBRRRRBK....",
        "..................................KGGGGGGGGGGGGGGGGGGGGGGGGGGGKBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBRRRRBK....",
        "..................................KGGGGGGGGGGGGGGGGGGGGGGGGGGGKBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBK....",
        "KKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKGGGGGGGGGGGGGGGGGGGGGGGGKGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGK....",
        "KBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBKGGGGGGGGGGGGGGGGGGGGGGGGKGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGK....",
        "KBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBRRRRBKGGGGGGGGGGGGGGGGGGGGGGGGKGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGK....",
        "KBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBRRRRBKGGGGGGGGGGGGGGGGGGGGGGGGKGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGK....",
        "KBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBRRRRBKGGGGGGGGGGGGGGGGGGGGGGGGKGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGK....",
        "KBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBKKKKKKKKKKKKKKKKKKKKKKKKKKGGGGGRRRRRGGGGDDDDDDDDDDDDDDDDDDGGGGK....",
        "KGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGK........................KGGGGRRRRRRRGGGDDDDDDDDDDDDDDDDDDGGGGK....",
        "KGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGK........................KGGGGWWRRRRRGGGGGGGGGGGGGGGGGGGGGGGGGK....",
        "KGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGK........................KGGGGWWRRRRRGGGGGGGGGGGGGGGGGGGGGGGGGK....",
        "KGGGDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDGGGK........................KGGGGWWRRRRRGGGGGGGGGGGGGGGGGGGGGGGGGK....",
        "KGGGDDDDDDDDDDDDDDDDDDDDDDDDKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKGRRRRRRRGGGDDDDDDDDDDDDDDGGGGGGGGK....",
        "KGGGGGGGGGGGGGGGGGGGGGGGGGGGKBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBKGGRRRRRGGGGDDDDDDDDDDDDDDGGGGGGGGK....",
        "KGGGGGGGGGGGGGGGGGGGGGGGGGGGKBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBRRRRBKGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGK....",
        "KGGGDDDDDDDDDDDDDDDDDDDDDDDDKBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBRRRRBKGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGK....",
        "KGGGDDDDDDDDDDDDDDDDDDDDDDDDKBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBRRRRBKGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGK....",
        "KGGGGGGGGGGGGGGGGGGGGGGGGGGGKBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBKGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGK....",
        "KGGGGGGGGGGGGGGGGGGGGGGGGGGGKGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGKGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGK....",
        "KGGGDDDDDDDDDDDDDDDDDDDDDDDDKGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGKGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGK....",
        "KGGGDDDDDDDDDDDDDDDDDDDDDDDDKGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGKGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGK....",
        "KGGGGGGGGGGGGGGGGGGGGGGGGGGGKGGGYYYYYYYYYYYYYYYYYYYYYYYYYYYYYYGGGKGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGK....",
        "KGGGGGGGGGGGGGGGGGGGGGGGGGGGKGGGYYYYYYYYYYYYYYYYYYYYYYYYYYYYYYGGGKGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGK....",
        "KGGGGGGGGGGGGGGGGGGGGGGGGGGGKGGGYYYYYYYYYYYYYYYYYYYYYYYYYYYYYYGGGKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKK....",
        "KGGGGGGGGGGGGGGGGGGGGGGGGGGGKGGGYYYYYYYYYYYYYYYYYYYYYYYYYYYYYYGGGK......................................",
        "KGGGGGGGGGGGGGGGGGGGGGGGGGGGKGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGK......................................",
        "KGGGGGGGGGGGGGGGGGGGGGGGGGGGKGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGK......................................",
        "KGGGGGGGGGGGGGGGGGGGGGGGGGGGKGGGGGGGGGGGGGGGGGGGGGGGGSSSSSSSSSGGGK......................................",
        "KGGGGGGGGGGGGGGGGGGGGGGGGGGGKGGGDDDDDDDDDDDDDDDDDDDDDSSSSSSSSSGGGK......................................",
        "KKKKKKKKKKKKKKKKKKKKKKKKKKKKKGGGDDDDDDDDDDDDDDDDDDDDDSSSSSSSSSGGGK......................................",
        "............................KGGGGGGGGGGGGGGGGGGGGGGGGSSSSSSSSSGGGK......................................",
        "............................KGGGGGGGGGGGGGGGGGGGGGGGGSSSSSSSSSGGGK......................................",
        "............................KGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGK......................................",
        "............................KGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGK......................................",
        "............................KGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGK......................................",
        "............................KGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGK......................................",
        "............................KGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGK......................................",
        "............................KGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGK......................................",
        "............................KGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGK......................................",
        "............................KKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKK......................................",
        "........................................................................................................",
        "........................................................................................................"
      ]
    },
    glitch: {
      label: "SIGNAL CORRUPTED",
      palette: { K: "#0a0d18", D: "#1c2450", M: "#ff3ce0", C: "#54f2ff", O: "#ff7a1c", W: "#e8ecff" },
      rows: [
        "WWWWWWWWWWWWWWWWWWWWWWWCCCCCCCDDDDDDDDMMMMMMMMMMMOOOOOOOOOOOOOOOOOOOODDDDDDDDDDDDDDDDDDD",
        "WWWWWWWWWWWWWWWWWWWWWWWCCCCCCCDDDDDDDDMMMMMMMMMMMOOOOOOOOOOOOOOOOOOOODDDDDDDDDDDDDDDDDDD",
        "WWWWWWWWWWWWWWWWWWWWWWWCCCCCCCDDDDDDDDMMMMMMMMMMMOOOOOOOOOOOOOOOOOOOODDDDDDDDDDDDDDDDDDD",
        "WWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWW",
        "WWWWWWWWWWWWWWWWWWWWWWWCCCCCCCDDDDDDDDMMMMMMMMMMMOOOOOOOOOOOOOOOOOOOODDDDDDDDDDDDDDDDDDD",
        "DDDDDDDDD..........DDDDDDDDDDDDDDDDDDDDDDDOOOOOOOOOOOOOOOOOOOWWWWWWWWWWWWWWWWWWWWWDDDDDD",
        "DDDDDDDDD..........DDDDDDDDDDDDDDDDDDDDDDDOOOOOOOOOOOOOOOOOOOWWWWWWWWWWWWWWWWWWWWWDDDDDD",
        "KKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKK",
        "KKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKK",
        "DDDDMMMMMMMMMMMMWWWWWWWWWCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCMMMMMMMMMMMMMMMMMMMMMMDDDDDDDDD",
        ".......OOOOOOOOOOOOOMMMMMMMMMMMMMMMMMMMMMMMCCCCCCCCCCCCCCCCDDDDDDDDDDDDDDDDDDDWWWWWWWWWW",
        ".......OOOOOOOOOOOOOMMMMMMMMMMMMMMMMMMMMMMMCCCCCCCCCCCCCCCCDDDDDDDDDDDDDDDDDDDWWWWWWWWWW",
        ".......OOOOOOOOOOOOOMMMMMMMMMMMMMMMMMMMMMMMCCCCCCCCCCCCCCCCDDDDDDDDDDDDDDDDDDDWWWWWWWWWW",
        ".......OOOOOOOOOOOOOMMMMMMMMMMMMMMMMMMMMMMMCCCCCCCCCCCCCCCCDDDDDDDDDDDDDDDDDDDWWWWWWWWWW",
        ".......OOOOOOOOOOOOOMMMMMMMMMMMMMMMMMMMMMMMCCCCCCCCCCCCCCCCDDDDDDDDDDDDDDDDDDDWWWWWWWWWW",
        ".......OOOOOOOOOOOOOMMMMMMMMMMMMMMMMMMMMMMMCCCCCCCCCCCCCCCCDDDDDDDDDDDDDDDDDDDWWWWWWWWWW",
        "MMMMMMMMMMMMMDDDDDDDDDDDCCCCCCCDDDDDDDDDDDWWWWWWWWWWWWWWWWWWWW.............OOOOOOOOOWWWW",
        "MMMMMMMMMMMMMDDDDDDDDDDDCCCCCCCDDDDDDDDDDDWWWWWWWWWWWWWWWWWWWW.............OOOOOOOOOWWWW",
        "MMMMMMMMMMMMMDDDDDDDDDDDCCCCCCCDDDDDDDDDDDWWWWWWWWWWWWWWWWWWWW.............OOOOOOOOOWWWW",
        "CCCCCCCCCCCCCCCCMMMMMMMMMMMMMMMDDDDDDDDDDDDDDDDOOOOOOOOOOOOODDDDDDDDDDDMMMMMMMMMMMMMMMMM",
        "CCCCCCCCCCCCCCCCMMMMMMMMMMMMMMMDDDDDDDDDDDDDDDDOOOOOOOOOOOOODDDDDDDDDDDMMMMMMMMMMMMMMMMM",
        "CCCCCCCCCCCCCCCCMMMMMMMMMMMMMMMDDDDDDDDDDDDDDDDOOOOOOOOOOOOODDDDDDDDDDDMMMMMMMMMMMMMMMMM",
        "CCCCCCCCCCCCCCCCMMMMMMMMMMMMMMMDDDDDDDDDDDDDDDDOOOOOOOOOOOOODDDDDDDDDDDMMMMMMMMMMMMMMMMM",
        "CCCCCCCCCCCCCCCCCMMMMMMMMMMMMMDDDDDDDDDDDDDDMMMMMMMMMMMMMMMMWWWWWWWWWWWWWWWWWWWWDDDDDDDD",
        "CCCCCCCCCCCCCCCCCMMMMMMMMMMMMMDDDDDDDDDDDDDDMMMMMMMMMMMMMMMMWWWWWWWWWWWWWWWWWWWWDDDDDDDD",
        "CCCCCCCCCCCCCCCCCMMMMMMMMMMMMMDDDDDDDDDDDDDDMMMMMMMMMMMMMMMMWWWWWWWWWWWWWWWWWWWWDDDDDDDD",
        "CCCCCCCCCCCCCCCCCMMMMMMMMMMMMMDDDDDDDDDDDDDDMMMMMMMMMMMMMMMMWWWWWWWWWWWWWWWWWWWWDDDDDDDD",
        "CCCCCCCCCCCCCCCCCMMMMMMMMMMMMMDDDDDDDDDDDDDDMMMMMMMMMMMMMMMMWWWWWWWWWWWWWWWWWWWWDDDDDDDD",
        "MMMMMMMMMMMMMMMMMDDDDDDDDDDDDDDD.......................WWWWWWWWWWWWWWWWWWWWWWWDDDDDDDDDD",
        "MMMMMMMMMMMMMMMMMDDDDDDDDDDDDDDD.......................WWWWWWWWWWWWWWWWWWWWWWWDDDDDDDDDD",
        "MMMMMMMMMMMMMMMMMDDDDDDDDDDDDDDD.......................WWWWWWWWWWWWWWWWWWWWWWWDDDDDDDDDD",
        "WWWWWWWWWWWW......................MMMMMMMMMMMMMMMDDDDOOOOOOOOOOODDDDDDDDDDDDDDDDDDDDDDDD",
        "WWWWWWWWWWWW......................MMMMMMMMMMMMMMMDDDDOOOOOOOOOOODDDDDDDDDDDDDDDDDDDDDDDD",
        "DDDDDDDDDDDDDDMMMMMMDDDDDD...............OOOOOOOOOOOOOOOOOOOOOCCCCCCCCCCCMMMMMMMMMMMMMMM",
        "DDDDDDDDDDDDDDMMMMMMDDDDDD...............OOOOOOOOOOOOOOOOOOOOOCCCCCCCCCCCMMMMMMMMMMMMMMM",
        "DDDDDDDDDDDDDDMMMMMMDDDDDD...............OOOOOOOOOOOOOOOOOOOOOCCCCCCCCCCCMMMMMMMMMMMMMMM",
        "WWWWWWWWWWWWCCCCCCCCCCCCCCCCCMMMMMMMMMWWWWWWWWWWWOOOOOOOOOOOOOMMMMMMDDDDDDDDDDDDDDDDDOOO",
        "WWWWWWWWWWWWCCCCCCCCCCCCCCCCCMMMMMMMMMWWWWWWWWWWWOOOOOOOOOOOOOMMMMMMDDDDDDDDDDDDDDDDDOOO",
        "WWWWWWWWWWWWCCCCCCCCCCCCCCCCCMMMMMMMMMWWWWWWWWWWWOOOOOOOOOOOOOMMMMMMDDDDDDDDDDDDDDDDDOOO",
        "KKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKK",
        "MMMMMMMMWWWWWWWMMMMMMMMMMMMMMMMMMM...........DDDDDDDDDDDDOOOOOOOOOOOOOOOOOOOOWWWWWWWWWDD",
        "MMMMMMMMWWWWWWWMMMMMMMMMMMMMMMMMMM...........DDDDDDDDDDDDOOOOOOOOOOOOOOOOOOOOWWWWWWWWWDD",
        "MMMMMMMMWWWWWWWMMMMMMMMMMMMMMMMMMM...........DDDDDDDDDDDDOOOOOOOOOOOOOOOOOOOOWWWWWWWWWDD",
        "MMMMMMMMWWWWWWWMMMMMMMMMMMMMMMMMMM...........DDDDDDDDDDDDOOOOOOOOOOOOOOOOOOOOWWWWWWWWWDD",
        "MMMMMMMMWWWWWWWMMMMMMMMMMMMMMMMMMM...........DDDDDDDDDDDDOOOOOOOOOOOOOOOOOOOOWWWWWWWWWDD",
        "WWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWW",
        "..............OOOOOOOOOOOOOOOOOOOODDDDDDDDDDDDDDDDDDDDDMMMMMMMMMMMMMMOOOOOOOOOOOOOOOOOWW",
        "..............OOOOOOOOOOOOOOOOOOOODDDDDDDDDDDDDDDDDDDDDMMMMMMMMMMMMMMOOOOOOOOOOOOOOOOOWW",
        "..............OOOOOOOOOOOOOOOOOOOODDDDDDDDDDDDDDDDDDDDDMMMMMMMMMMMMMMOOOOOOOOOOOOOOOOOWW",
        "..............OOOOOOOOOOOOOOOOOOOODDDDDDDDDDDDDDDDDDDDDMMMMMMMMMMMMMMOOOOOOOOOOOOOOOOOWW",
        "..............OOOOOOOOOOOOOOOOOOOODDDDDDDDDDDDDDDDDDDDDMMMMMMMMMMMMMMOOOOOOOOOOOOOOOOOWW",
        "MMMMMMMMMMMMMMMCCCCCCCCCCCCCCCCCCDDDDDDDDDDDDDDDDDDDDOOOOOOOOODDDDDDDDDDDDMMMMMMMMMMMMMM",
        "MMMMMMMMMMMMMMMCCCCCCCCCCCCCCCCCCDDDDDDDDDDDDDDDDDDDDOOOOOOOOODDDDDDDDDDDDMMMMMMMMMMMMMM",
        "MMMMMMMMMMMMMMMCCCCCCCCCCCCCCCCCCDDDDDDDDDDDDDDDDDDDDOOOOOOOOODDDDDDDDDDDDMMMMMMMMMMMMMM",
        "MMMMMMMMMMMMMMMCCCCCCCCCCCCCCCCCCDDDDDDDDDDDDDDDDDDDDOOOOOOOOODDDDDDDDDDDDMMMMMMMMMMMMMM",
        "WWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWW",
        "WWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWW",
        "WWWWWMMMM.............OOOOOOOOOOOOOOOOOOOODDDDDDDCCCCCCDDDDDDDDDDDDDDDDDMMMMMMMMMDDDDDDD",
        "WWWWWMMMM.............OOOOOOOOOOOOOOOOOOOODDDDDDDCCCCCCDDDDDDDDDDDDDDDDDMMMMMMMMMDDDDDDD",
        "WWWWWMMMM.............OOOOOOOOOOOOOOOOOOOODDDDDDDCCCCCCDDDDDDDDDDDDDDDDDMMMMMMMMMDDDDDDD"
      ]
    },
    construction: {
      label: "UNDER CONSTRUCTION",
      palette: { K: "#0a0d18", Y: "#ffcc33", P: "#8b8fa8", O: "#ff7a1c", W: "#ffffff", E: "#6b5a3a" },
      rows: [
        "................................................................................................",
        "....KKKKKK......KKKKKK......KKKKKK......KKKKKK......KKKKKK......KKKKKK......KKKKKK......KKKKKK..",
        "..KKYYYYYYKKKKKKYYYYYYKKKKKKYYYYYYKKKKKKYYYYYYKKKKKKYYYYYYKKKKKKYYYYYYKKKKKKYYYYYYKKKKKKYYYYYYK.",
        "..KYYYYYYKKKKKKYYYYYYKKKKKKYYYYYYKKKKKKYYYYYYKKKKKKYYYYYYKKKKKKYYYYYYKKKKKKYYYYYYKKKKKKYYYYYYK..",
        ".KYYYYYYKKKKKKYYYYYYKKKKKKYYYYYYKKKKKKYYYYYYKKKKKKYYYYYYKKKKKKYYYYYYKKKKKKYYYYYYKKKKKKYYYYYYKK..",
        ".KYYYYYKKKKKKYYYYYYKKKKKKYYYYYYKKKKKKYYYYYYKKKKKKYYYYYYKKKKKKYYYYYYKKKKKKYYYYYYKKKKKKYYYYYYKKK..",
        ".KYYYYKKKKKKYYYYYYKKKKKKYYYYYYKKKKKKYYYYYYKKKKKKYYYYYYKKKKKKYYYYYYKKKKKKYYYYYYKKKKKKYYYYYYKKKK..",
        ".KYYYKKKKKKYYYYYYKKKKKKYYYYYYKKKKKKYYYYYYKKKKKKYYYYYYKKKKKKYYYYYYKKKKKKYYYYYYKKKKKKYYYYYYKKKKK..",
        ".KYYKKKKKKYYYYYYKKKKKKYYYYYYKKKKKKYYYYYYKKKKKKYYYYYYKKKKKKYYYYYYKKKKKKYYYYYYKKKKKKYYYYYYKKKKKK..",
        ".KYKKKKKKYYYYYYKKKKKKYYYYYYKKKKKKYYYYYYKKKKKKYYYYYYKKKKKKYYYYYYKKKKKKYYYYYYKKKKKKYYYYYYKKKKKKYK.",
        "..KKKKKKYYYYYYKKKKKKYYYYYYKKKKKKYYYYYYKKKKKKYYYYYYKKKKKKYYYYYYKKKKKKYYYYYYKKKKKKYYYYYYKKKKKKYYK.",
        "..KKKKKYYYYYYKKKKKKYYYYYYKKKKKKYYYYYYKKKKKKYYYYYYKKKKKKYYYYYYKKKKKKYYYYYYKKKKKKYYYYYYKKKKKKYYYK.",
        "..KKKKYYYYYYKKKKKKYYYYYYKKKKKKYYYYYYKKKKKKYYYYYYKKKKKKYYYYYYKKKKKKYYYYYYKKKKKKYYYYYYKKKKKKYYYYK.",
        "..KKKYYYYYYKKKKKKYYYYYYKKKKKKYYYYYYKKKKKKYYYYYYKKKKKKYYYYYYKKKKKKYYYYYYKKKKKKYYYYYYKKKKKKYYYYYK.",
        ".....KKKKKPPPPK..KKKKKK......KKKKKK......KKKKKK......KKKKKK......KKKKKK......KKKPPPPK....KKKKK..",
        ".........KPPPPK................................................................KPPPPK...........",
        ".........KPPPPK................................................................KPPPPK...........",
        ".........KPPPPK................................................................KPPPPK...........",
        ".........KPPPPK................................................................KPPPPK...........",
        ".........KPPPPK................................................................KPPPPK...........",
        ".........KPPPPK................................................................KPPPPK...........",
        ".........KPPPPK................................................................KPPPPK...........",
        ".........KPPPPK................................................................KPPPPK...........",
        ".........KPPPPK.........K.......................K.....................K........KPPPPK...........",
        ".........KPPPPK........KOK.....................KOK...................KOK.......KPPPPK...........",
        ".........KPPPPK........KOK.....................KOK...................KOK.......KPPPPK...........",
        "..........KKKK........KOOOK...................KOOOK.................KOOOK.......KKKK............",
        "......................KOOOK...................KOOOK.................KOOOK.......................",
        "......................KOOOK...................KOOOK.................KOOOK.......................",
        ".....................KOOOOOK.................KOOOOOK...............KOOOOOK......................",
        ".....................KOOOOOK.................KOOOOOK...............KOOOOOK......................",
        ".....................KOOOOOK.................KOOOOOK...............KOOOOOK......................",
        "....................KWWWWWWWK.............KKKWWWWWWWKKK...........KWWWWWWWK.....................",
        "....................KWWWWWWWK........KKKKKEEEWWWWWWWEEEKKKKK......KWWWWWWWK.....................",
        "....................KWWWWWWWK.....KKKEEEEEEEEWWWWWWWEEEEEEEEKKK...KWWWWWWWK.....................",
        "....................KOOOOOOOK..KKKEEEEEEEEEEEOOOOOOOEEEEEEEEEEEKKKKOOOOOOOK.....................",
        "...................KOOOOOOOOOKKEEEEEEEEEEEEEOOOOOOOOOEEEEEEEEEEEEEOOOOOOOOOK....................",
        "...................KOOOOOOOOOEEEEEEEEEEEEEEEOOOOOOOOOEEEEEEEEEEEEEOOOOOOOOOK....................",
        ".................KKKOOOOOOOOOEEEEEEEEEEEEEEEOOOOOOOOOEEEEEEEEEEEEEOOOOOOOOOKKK..................",
        "................KOOOOOOOOOOOOOOOEEEEEEEEEOOOOOOOOOOOOOOOEEEEEEEOOOOOOOOOOOOOOOK.................",
        "................KOOOOOOOOOOOOOOOEEEEEEEEEOOOOOOOOOOOOOOOEEEEEEEOOOOOOOOOOOOOOOK.................",
        "................KOOOOOOOOOOOOOOOEEEEEEEEEOOOOOOOOOOOOOOOEEEEEEEOOOOOOOOOOOOOOOK.................",
        ".................KEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEK.................",
        ".................KEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEK................."
      ]
    },
    frames: {
      label: "NESTED FRAMESET",
      palette: { K: "#0a0d18", W: "#e8ecff", S: "#c9d4e6", D: "#8b8fa8", B: "#2b6ef6" },
      rows: [
        "KKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKK",
        "KBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBKKBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBK",
        "KBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBKKBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBK",
        "KBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBKKBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBK",
        "KWWWWWWWWWWWWWWWWWWWWWWWWWWWWSSSSKKWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWSSSSK",
        "KWWWWWWWWWWWWWWWWWWWWWWWWWWWWDDDDKKWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWDDDDK",
        "KWWWWWWWWWWWWWWWWWWWWWWWWWWWWDDDDKKWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWDDDDK",
        "KWWDDDDDDDDDDDDDDDDDDDDDDDWWWDDDDKKWWDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDWWWDDDDK",
        "KWWWWWWWWWWWWWWWWWWWWWWWWWWWWDDDDKKWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWDDDDK",
        "KWWWWWWWWWWWWWWWWWWWWWWWWWWWWDDDDKKWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWDDDDK",
        "KWWWWWWWWWWWWWWWWWWWWWWWWWWWWSSSSKKWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWSSSSK",
        "KWWDDDDDDDDDDDDDDDDDDDWWWWWWWSSSSKKWWDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDWWWWWWWSSSSK",
        "KWWWWWWWWWWWWWWWWWWWWWWWWWWWWSSSSKKWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWSSSSK",
        "KWWWWWWWWWWWWWWWWWWWWWWWWWWWWSSSSKKWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWSSSSK",
        "KWWWWWWWWWWWWWWWWWWWWWWWWWWWWSSSSKKWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWSSSSK",
        "KWWDDDDDDDDDDDDDDDWWWWWWWWWWWSSSSKKWWDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDWWWWWWWWWWWSSSSK",
        "KWWWWWWWWWWWWWWWWWWWWWWWWWWWWSSSSKKWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWSSSSK",
        "KWWWWWWWWWWWWWWWWWWWWWWWWWWWWSSSSKKWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWSSSSK",
        "KWWWWWWWWWWWWWWWWWWWWWWWWWWWWSSSSKKWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWSSSSK",
        "KWWDDDDDDDDDDDDDDDDDDDDDDDWWWSSSSKKWWDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDWWWSSSSK",
        "KWWWWWWWWWWWWWWWWWWWWWWWWWWWWSSSSKKWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWSSSSK",
        "KWWWWWWWWWWWWWWWWWWWWWWWWWWWWSSSSKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKK",
        "KWWWWWWWWWWWWWWWWWWWWWWWWWWWWSSSSKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKK",
        "KWWDDDDDDDDDDDDDDDDDDDWWWWWWWSSSSKKBBBBBBBBBBBBBBBBBBBBBBBBBBBBKKBBBBBBBBBBBBBBBBBBBBBBBBBBK",
        "KWWWWWWWWWWWWWWWWWWWWWWWWWWWWSSSSKKBBBBBBBBBBBBBBBBBBBBBBBBBBBBKKBBBBBBBBBBBBBBBBBBBBBBBBBBK",
        "KWWWWWWWWWWWWWWWWWWWWWWWWWWWWSSSSKKBBBBBBBBBBBBBBBBBBBBBBBBBBBBKKBBBBBBBBBBBBBBBBBBBBBBBBBBK",
        "KWWWWWWWWWWWWWWWWWWWWWWWWWWWWSSSSKKWWWWWWWWWWWWWWWWWWWWWWWWSSSSKKWWWWWWWWWWWWWWWWWWWWWWSSSSK",
        "KWWDDDDDDDDDDDDDDDWWWWWWWWWWWSSSSKKWWWWWWWWWWWWWWWWWWWWWWWWDDDDKKWWWWWWWWWWWWWWWWWWWWWWDDDDK",
        "KWWWWWWWWWWWWWWWWWWWWWWWWWWWWSSSSKKWWWWWWWWWWWWWWWWWWWWWWWWDDDDKKWWWWWWWWWWWWWWWWWWWWWWDDDDK",
        "KWWWWWWWWWWWWWWWWWWWWWWWWWWWWSSSSKKWWDDDDDDDDDDDDDDDDDDDWWWDDDDKKWWDDDDDDDDDDDDDDDDDWWWDDDDK",
        "KWWWWWWWWWWWWWWWWWWWWWWWWWWWWSSSSKKWWWWWWWWWWWWWWWWWWWWWWWWDDDDKKWWWWWWWWWWWWWWWWWWWWWWDDDDK",
        "KWWDDDDDDDDDDDDDDDDDDDDDDDWWWSSSSKKWWWWWWWWWWWWWWWWWWWWWWWWDDDDKKWWWWWWWWWWWWWWWWWWWWWWDDDDK",
        "KWWWWWWWWWWWWWWWWWWWWWWWWWWWWSSSSKKWWWWWWWWWWWWWWWWWWWWWWWWSSSSKKWWWWWWWWWWWWWWWWWWWWWWSSSSK",
        "KWWWWWWWWWWWWWWWWWWWWWWWWWWWWSSSSKKWWDDDDDDDDDDDDDDDWWWWWWWSSSSKKWWDDDDDDDDDDDDDWWWWWWWSSSSK",
        "KWWWWWWWWWWWWWWWWWWWWWWWWWWWWSSSSKKWWWWWWWWWWWWWWWWWWWWWWWWSSSSKKWWWWWWWWWWWWWWWWWWWWWWSSSSK",
        "KWWDDDDDDDDDDDDDDDDDDDWWWWWWWSSSSKKWWWWWWWWWWWWWWWWWWWWWWWWSSSSKKWWWWWWWWWWWWWWWWWWWWWWSSSSK",
        "KWWWWWWWWWWWWWWWWWWWWWWWWWWWWSSSSKKWWWWWWWWWWWWWWWWWWWWWWWWSSSSKKWWWWWWWWWWWWWWWWWWWWWWSSSSK",
        "KWWWWWWWWWWWWWWWWWWWWWWWWWWWWSSSSKKWWDDDDDDDDDDDWWWWWWWWWWWSSSSKKWWDDDDDDDDDWWWWWWWWWWWSSSSK",
        "KWWWWWWWWWWWWWWWWWWWWWWWWWWWWSSSSKKWWWWWWWWWWWWWWWWWWWWWWWWSSSSKKWWWWWWWWWWWWWWWWWWWWWWSSSSK",
        "KWWDDDDDDDDDDDDDDDWWWWWWWWWWWSSSSKKWWWWWWWWWWWWWWWWWWWWWWWWSSSSKKWWWWWWWWWWWWWWWWWWWWWWSSSSK",
        "KWWWWWWWWWWWWWWWWWWWWWWWWWWWWSSSSKKWWWWWWWWWWWWWWWWWWWWWWWWSSSSKKWWWWWWWWWWWWWWWWWWWWWWSSSSK",
        "KWWWWWWWWWWWWWWWWWWWWWWWWWWWWSSSSKKWWDDDDDDDDDDDDDDDDDDDWWWSSSSKKKKKKKKKKKKKKKKKKKKKKKKKKKKK",
        "KWWWWWWWWWWWWWWWWWWWWWWWWWWWWSSSSKKWWWWWWWWWWWWWWWWWWWWWWWWSSSSKKKKKKKKKKKKKKKKKKKKKKKKKKKKK",
        "KWWDDDDDDDDDDDDDDDDDDDDDDDWWWSSSSKKWWWWWWWWWWWWWWWWWWWWWWWWSSSSKKBBBBBBBBBBBBBBBBBBBBBBBBBBK",
        "KWWWWWWWWWWWWWWWWWWWWWWWWWWWWSSSSKKWWWWWWWWWWWWWWWWWWWWWWWWSSSSKKBBBBBBBBBBBBBBBBBBBBBBBBBBK",
        "KWWWWWWWWWWWWWWWWWWWWWWWWWWWWSSSSKKWWDDDDDDDDDDDDDDDWWWWWWWSSSSKKBBBBBBBBBBBBBBBBBBBBBBBBBBK",
        "KWWWWWWWWWWWWWWWWWWWWWWWWWWWWSSSSKKWWWWWWWWWWWWWWWWWWWWWWWWSSSSKKWWWWWWWWWWWWWWWWWWWWWWSSSSK",
        "KWWDDDDDDDDDDDDDDDDDDDWWWWWWWSSSSKKWWWWWWWWWWWWWWWWWWWWWWWWSSSSKKWWWWWWWWWWWWWWWWWWWWWWDDDDK",
        "KWWWWWWWWWWWWWWWWWWWWWWWWWWWWSSSSKKWWWWWWWWWWWWWWWWWWWWWWWWSSSSKKWWWWWWWWWWWWWWWWWWWWWWDDDDK",
        "KWWWWWWWWWWWWWWWWWWWWWWWWWWWWSSSSKKWWDDDDDDDDDDDWWWWWWWWWWWSSSSKKWWDDDDDDDDDDDDDDDDDWWWDDDDK",
        "KWWWWWWWWWWWWWWWWWWWWWWWWWWWWSSSSKKWWWWWWWWWWWWWWWWWWWWWWWWSSSSKKWWWWWWWWWWWWWWWWWWWWWWDDDDK",
        "KWWDDDDDDDDDDDDDDDWWWWWWWWWWWSSSSKKWWWWWWWWWWWWWWWWWWWWWWWWSSSSKKWWWWWWWWWWWWWWWWWWWWWWDDDDK",
        "KWWWWWWWWWWWWWWWWWWWWWWWWWWWWSSSSKKWWWWWWWWWWWWWWWWWWWWWWWWSSSSKKWWWWWWWWWWWWWWWWWWWWWWSSSSK",
        "KWWWWWWWWWWWWWWWWWWWWWWWWWWWWSSSSKKWWDDDDDDDDDDDDDDDDDDDWWWSSSSKKWWDDDDDDDDDDDDDWWWWWWWSSSSK",
        "KWWWWWWWWWWWWWWWWWWWWWWWWWWWWSSSSKKWWWWWWWWWWWWWWWWWWWWWWWWSSSSKKWWWWWWWWWWWWWWWWWWWWWWSSSSK",
        "KWWDDDDDDDDDDDDDDDDDDDDDDDWWWSSSSKKWWWWWWWWWWWWWWWWWWWWWWWWSSSSKKWWWWWWWWWWWWWWWWWWWWWWSSSSK",
        "KWWWWWWWWWWWWWWWWWWWWWWWWWWWWSSSSKKWWWWWWWWWWWWWWWWWWWWWWWWSSSSKKWWWWWWWWWWWWWWWWWWWWWWSSSSK",
        "KWWWWWWWWWWWWWWWWWWWWWWWWWWWWSSSSKKWWDDDDDDDDDDDDDDDWWWWWWWSSSSKKWWDDDDDDDDDWWWWWWWWWWWSSSSK",
        "KWWWWWWWWWWWWWWWWWWWWWWWWWWWWSSSSKKWWWWWWWWWWWWWWWWWWWWWWWWSSSSKKWWWWWWWWWWWWWWWWWWWWWWSSSSK",
        "KKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKK"
      ]
    },
    norton: {
      label: "NORTON SHIELD",
      palette: { K: "#0a0d18", Y: "#ffcc33" },
      rows: [
        "................................",
        "................................",
        "....KKKKKKKKKKKKKKKKKKKKKKKKK...",
        "...KYYYYYYYYYYYYYYYYYYYYYYYYYK..",
        "...KYYYYYYYYYYYYYYYYYYYYYYYYYK..",
        "...KYYYYYYYYYYYYYYYYYYYYYYYYYK..",
        "...KYYYKKKKKKKKKKKKKKKKKKKYYYK..",
        "...KYYYKKKKKKKKKKKKKKKKKKKYYYK..",
        "...KYYYKKKKKKKKKKKKKKYYYKKYYYK..",
        "...KYYYKKKKKKKKKKKKKKYYYKKYYYK..",
        "...KYYYKKKKKKKKKKKKKYYYYKKYYYK..",
        "...KYYYKKKKKKKKKKKKYYYYKKKYYYK..",
        "...KYYYKKKKKKKKKKKYYYYKKKKYYYK..",
        "...KYYYKKKYYYKKKKKYYYYKKKKYYYK..",
        "...KYYYKKKYYYYKKKYYYYKKKKKYYYK..",
        "...KYYYKKKYYYYKKYYYYKKKKKKYYYK..",
        "...KYYYKKKKYYYYKYYYYKKKKKKYYYK..",
        "...KYYYYKKKKYYYYYYYKKKKKKYYYYK..",
        "....KYYYYKKKKYYYYYKKKKKKYYYYK...",
        ".....KYYYYKKKYYYYKKKKKKYYYYK....",
        "......KYYYYKKKYYYKKKKKYYYYK.....",
        ".......KYYYYKKKKKKKKKYYYYK......",
        "........KYYYYKKKKKKKYYYYK.......",
        ".........KYYYYKKKKKYYYYK........",
        "..........KYYYYKKKYYYYK.........",
        "...........KYYYYYYYYYK..........",
        "............KYYYYYYYK...........",
        ".............KYYYYYK............",
        "..............KYYYK.............",
        "...............KKK..............",
        "................................",
        "................................"
      ]
    },
    bolt: {
      label: "BROADBAND",
      palette: { K: "#0a0d18", C: "#2bb8d6", W: "#a8f4ff" },
      rows: [
        "................................",
        "...............KKKKKKKKKKKK.....",
        "..............KCCCCCCCCCCCCK....",
        ".............KCCCCCCCCCCCCK.....",
        ".............KCCCCCCCCCCCCK.....",
        "............KCCCWWWWWWWWCK......",
        "............KCCWWWWWWWWCK.......",
        "...........KCCCWWWWWWWWCK.......",
        "...........KCCWWWWWWWWCK........",
        "..........KCCCWWWWWWWCCK........",
        "..........KCCWWWWWWWWCK.........",
        ".........KCCCWWWWWWWCK..........",
        ".........KCCWWWWWWWCCKKKKKK.....",
        "........KCCCWWWWWWWCCCCCCCCK....",
        "........KCCWWWWWWWWWWWWCCCK.....",
        ".......KCCCWWWWWWWWWWWCCCK......",
        ".......KCCCCCCCCWWWWWWCCK.......",
        "........KKKKKKCCWWWWWCCK........",
        ".............KCWWWWWCCCK........",
        ".............KCWWWWCCCK.........",
        "............KCCWWWWCCK..........",
        "............KCCWWWCCK...........",
        "............KCWWWCCK............",
        "............KCWWCCK.............",
        "...........KCCWWCK..............",
        "...........KCWWCK...............",
        "...........KCCCCK...............",
        "...........KCCCK................",
        "..........KCCCK.................",
        "..........KCCK..................",
        "...........KK...................",
        "................................"
      ]
    },
    floppy: {
      label: "SAVED",
      palette: { K: "#0a0d18", B: "#2b3550", D: "#8b8fa8", M: "#c9d4e6", W: "#e8ecff" },
      rows: [
        "................................",
        "..KKKKKKKKKKKKKKKKKKKKKKKKKKKKK.",
        ".KBBBBBBBBMMMMMMMMMMMMBBDDDDDDDK",
        ".KBBBBBBBBMDDDDMMMMMMMBBBDDDDDDK",
        ".KBBBBBBBBMDDDDMMMMMMMBBBBDDDDDK",
        ".KBBBBBBBBMDDDDMMMMMMMBBBBBDDDDK",
        ".KBBBBBBBBMDDDDMMMMMMMBBBBBBDDDK",
        ".KBBBBBBBBMDDDDMMMMMMMBBBBBBBDDK",
        ".KBBBBBBBBMDDDDMMMMMMMBBBBBBBBK.",
        ".KBBBBBBBBMDDDDMMMMMMMBBBBBBBBK.",
        ".KBBBBBBBBMDDDDMMMMMMMBBBBBBBBK.",
        ".KBBBBBBBBMDDDDMMMMMMMBBBBBBBBK.",
        ".KBBBBBBBBMMMMMMMMMMMMBBBBBBBBK.",
        ".KBBBBBBBBBBBBBBBBBBBBBBBBBBBBK.",
        ".KBBBBBBBBBBBBBBBBBBBBBBBBBBBBK.",
        ".KBBBBBBBBBBBBBBBBBBBBBBBBBBBBK.",
        ".KBBBBBBBBBBBBBBBBBBBBBBBBBBBBK.",
        ".KBBBBWWWWWWWWWWWWWWWWWWWWBBBBK.",
        ".KBBBBWWWWWWWWWWWWWWWWWWWWBBBBK.",
        ".KBBBBWWDDDDDDDDDDDDDDDDWWBBBBK.",
        ".KBBBBWWDDDDDDDDDDDDDDDDWWBBBBK.",
        ".KBBBBWWWWWWWWWWWWWWWWWWWWBBBBK.",
        ".KBBBBWWWWWWWWWWWWWWWWWWWWBBBBK.",
        ".KBBBBWWDDDDDDDDDDDWWWWWWWBBBBK.",
        ".KBBBBWWDDDDDDDDDDDWWWWWWWBBBBK.",
        ".KBBBBWWWWWWWWWWWWWWWWWWWWBBBBK.",
        ".KBBBBWWWWWWWWWWWWWWWWWWWWBBBBK.",
        ".KBBBBWWWWWWWWWWWWWWWWWWWWBBBBK.",
        ".KBBBBWWWWWWWWWWWWWWWWWWWWBBBBK.",
        ".KBBBBWWWWWWWWWWWWWWWWWWWWBBBBK.",
        "..KKKKKKKKKKKKKKKKKKKKKKKKKKKK..",
        "................................"
      ]
    },
    portal: {
      label: "HYPERLINK JUMP",
      palette: { K: "#0a0d18", P: "#4a1f8a", V: "#b07cff", D: "#1a0a33", C: "#54f2ff", W: "#ffffff" },
      rows: [
        "................................",
        "..............KKKKK.............",
        "...........KKKVVVVVKKK..........",
        ".........KKVVVVVVVVVVVKK........",
        ".......KKVVVVVVVVVVVVVVVKK......",
        "......KVVVVVVVVVVVVVVVVVVVK.....",
        ".....KVVVVVVPPPPPPPPPVVVVVVK....",
        "....KVVVVVPPPPPPWPPPPPPVVVVVK...",
        "....KVVVVPPPPPCWWWCPPPPPVVVVK...",
        "...KVVVVPPPPCCWWWWWCCPPPPVVVVK..",
        "...KVVVPPPPCCWWWWWWWCCPPPPVVVK..",
        "..KVVVVPPPCCWWWWDWWWWCCPPPVVVVK.",
        "..KVVVPPPCCCWWWDDDWWWCCCPPPVVVK.",
        "..KVVVPPPCCWWWDDWDDWWWCCPPPVVVK.",
        ".KVVVVPPCCWWWWDWWWDWWWWCCPPVVVVK",
        ".KVVVVPPCWWWWDWWWWWDWWWWCPPVVVVK",
        ".KVVVVPPCWWWDWWWWWWWDWWWCPPVVVVK",
        ".KVVVVPPWWWDWWWWDWWWWDWWWPPVVVVK",
        ".KVVVVPPCWCDWWWDDDWWWDCWCPPVVVVK",
        "..KVVVPPPCCWWWDDDDDWWWCCPPPVVVK.",
        "..KVVVPPPCWWWWDDDDDWWWWCPPPVVVK.",
        "..KVVVVPPWWWWDDDDDDDWWWWPPVVVVK.",
        "...KVVVPPWWWCCCCCCCCCWWWPPVVVK..",
        "...KVVVVWWWPCCCCCCCCCPWWWVVVVK..",
        "....KVVVVWPPPPCCCCCPPPPWVVVVK...",
        "....KVVVVVPPPPPPPPPPPPPVVVVVK...",
        ".....KVVVVVVPPPPPPPPPVVVVVVK....",
        "......KVVVVVVVVVVVVVVVVVVVK.....",
        ".......KKVVVVVVVVVVVVVVVKK......",
        ".........KKVVVVVVVVVVVKK........",
        "...........KKKVVVVVKKK..........",
        "..............KKKKK............."
      ]
    },
    link: {
      palette: { K: "#0a0d18", C: "#2b6ef6", W: "#a8e8ff" },
      rows: [
        "........................",
        "........................",
        "........................",
        "........................",
        "........................",
        "......KKKKK...KKKKK.....",
        "....KKWWWWWKKKWWWWWKK...",
        "...KWWWCCCCWWWWCCCCWWK..",
        "..KWWWCCCCCWWWCCCCCCWWK.",
        "..KWCCKKKKKWCWKKKKKCCWK.",
        ".KWCCK...KWCCCWK...KCCWK",
        ".KWCCK...KWCCCWK...KCCWK",
        ".KWCCK...KWCCCWK...KCCWK",
        ".KWCCK...KWCCCWK...KCCWK",
        ".KWCCK...KWCCCWK...KCCWK",
        "..KWCCKKKKKWCWKKKKKCCWK.",
        "..KWWCCCCCCWWWCCCCCCWWK.",
        "...KWWCCCCCWWWCCCCCWWK..",
        "....KKWWWWWKKKWWWWWKK...",
        "......KKKKK...KKKKK.....",
        "........................",
        "........................",
        "........................",
        "........................"
      ]
    },
    clippy: {
      label: "CLIPPY",
      palette: { K: "#0a0d18", M: "#c9d4e6", D: "#7a8299", W: "#ffffff" },
      rows: [
        "................................................................",
        "................................................................",
        "................................................................",
        "..................KK...............KKK.......KK.................",
        ".................KMMKK..........KKKDMMKKK..KKMMK................",
        "................KMMMMMKKK.....KKDMMMMMMMMKKMMMMMK...............",
        ".................KMMMMMMMKK..KDMMMMMMMMMMMMMMMMK................",
        "..................KKMMMMMMMKKDMMMMMMMMMMMMMMMKK.................",
        "....................KKMMMMMMMMMMMMMMMMMMMMMMMK..................",
        "....................KKKWKMMMMMMMMKKMMMMMDMMMMK..................",
        "...................KWWWWWWWMMMMMK..KMMWWWMMMMMK.................",
        "..................KWWWWWWWWMMMMK....KWWWWWMMMMK.................",
        ".................KWWWWWWWWWMMMMK...KWWWWWWMMMMWK................",
        "................KWWWWWWWWWMMMMMK..KWWWWWWWMMMMWWK...............",
        "................KWWWWWWWWWMMMMMK..KWWWWWWWMMMMMWK...............",
        "...............KWWWWWWWWWWWMMMWK.KWWWWWWWWMMMMMWWK..............",
        "...............KDWWWWWWWWWWWWWWK.KWWWWWWWWMMMMMWWK..............",
        "..............KDMMWKKKKWWWWWWWWK.KWWWKKKKWMMMMMWWK..............",
        ".............KDMMMMWKKKKWWWWWWWK.KWWKWKKKKMMMMMWWK..............",
        ".............KDMMMMKKKKKKWWWWWWK.KWKKKKKKKMMMMMWWK..............",
        ".............KDMMMMKKKKKKWWWWWWK.KWKKKKKKKMMMMMWWK..............",
        ".............KDMMMMKKKKKKWWWWWWK.KWKKKKKKKMMMMMWWK..............",
        ".............KDMMMMKKKKKWWWWWWMK..KWKKKKKKMMMMMWK...............",
        ".............KDMMMMKKKKWWWWWWWMK..KWWKKKKWMMMMMWK...............",
        ".............KDMMMMWWWWWWWWWWMMK...KWWWWWWMMMMMK................",
        ".............KDMMMMWWWWWWWWWMMMK...KDWWWWWMMMMMK................",
        ".............KDMMMMKWWWWWWWMMMMK...KDMWWWWMMMMMK................",
        ".............KDMMMMKKKKWKKDMMMMK...KDMMMMWMMMMMK................",
        ".............KDMMMMK...K.KDMMMMK...KDMMMMKDMMMMK................",
        ".............KDMMMMK.....KDMMMMK...KDMMMMKDMMMMK................",
        ".............KDMMMMK.....KDMMMMK...KDMMMMKDMMMMK................",
        ".............KDMMMMK.....KDMMMMK...KDMMMMKDMMMMK................",
        ".............KDMMMMK.....KDMMMMK...KDMMMMKDMMMMK................",
        ".............KDMMMMK.....KDMMMMK...KDMMMMKDMMMMK................",
        ".............KDMMMMK.....KDMMMMK...KDMMMMKDMMMMK................",
        ".............KDMMMMK.....KDMMMMK...KDMMMMKDMMMMK................",
        ".............KDMMMMK.....KDMMMMK...KDMMMMKDMMMMK................",
        ".............KDMMMMK.....KDMMMMK...KDMMMKKDMMMMK................",
        ".............KDMMMMK......KDMMMKKKKKDMMMKKDMMMMK................",
        ".............KDMMMMK......KDMMMMMMMMMMMMKKDMMMMK................",
        ".............KDMMMMK.......KDMMMMMMMMMMK.KDMMMMK................",
        ".............KDMMMMK.......KDMMMMMMMMMMK.KDMMMK.................",
        "..............KDMMMK........KKDMMMMMMKK..KDMMMK.................",
        "..............KDMMMK..........KKKKKKK....KDMMMK.................",
        "..............KDMMMK.....................KDMMMK.................",
        "..............KDMMMMK...................KDMMMMK.................",
        "...............KDMMMK...................KDMMMK..................",
        "...............KDMMMMK.................KDMMMMK..................",
        "................KDMMMMK...............KDMMMMK...................",
        "................KDMMMMMK.............KDMMMMMK...................",
        ".................KDMMMMMKK.........KKDMMMMMK....................",
        "..................KDMMMMMMKKKKKKKKKDMMMMMMK.....................",
        "...................KDMMMMMMMMMMMMMMMMMMMMK......................",
        "....................KDMMMMMMMMMMMMMMMMMMK.......................",
        ".....................KKDMMMMMMMMMMMMMMKK........................",
        ".......................KKDMMMMMMMMMMKK..........................",
        ".........................KKKKKKKKKKK............................",
        "................................................................",
        "................................................................",
        "................................................................",
        "................................................................",
        "................................................................",
        "................................................................",
        "................................................................"
      ]
    },
    life: {
      palette: { K: "#0a0d18", B: "#2b3550", D: "#8b8fa8", M: "#c9d4e6", W: "#e8ecff" },
      rows: [
        "BBBMMMMMBBB",
        "BBBMDDMMBBB",
        "BBBMDDMMBBB",
        "BBBMDDMMBBB",
        "BBBMMMMMBBB",
        "BBBBBBBBBBB",
        "BBWWWWWWWBB",
        "BBWDDDDDWBB",
        "BBWWWWWWWBB",
        "BBWWWWWWWBB",
        "BBWWWWWWWBB"
      ]
    }
  };

  // Two kinds of thing get in your way, and each era below picks its own
  // line-up of both:
  //   hazards — small dead services and software; hitting one costs a life.
  //   sludge  — big harmless junk you wade through; no damage, but your speed
  //             collapses and Clippy eats the gap while you're in it.
  var POWERUPS = [
    { key: "norton", kind: "shield", weight: 3 },
    { key: "bolt", kind: "boost", weight: 3 },
    { key: "portal", kind: "jump", weight: 3 },
    { key: "floppy", kind: "life", weight: 1 }
  ];

  // Eras. Crossing into one repaints the world and swaps which junk turns up,
  // so a long run has chapters instead of one flat ramp. Colours are [r,g,b]
  // so they can be eased between on the way in.
  var ZONES = [
    {
      at: 0, name: "1994 DIAL-UP",
      bg: [11, 16, 38], grid: [22, 34, 77], mote: [34, 49, 95],
      hazards: ["netscape", "aol", "icq", "notfound", "hitcounter",
        "modem", "phone", "guestbook", "toaster", "midi"],
      sludge: ["construction", "popupstorm", "frames"]
    },
    {
      at: 2700, name: "1997 MULTIMEDIA",
      bg: [23, 11, 46], grid: [50, 26, 99], mote: [78, 44, 134],
      hazards: ["winamp", "java", "msn", "icq", "notfound", "aol",
        "jeeves", "hourglass", "skipintro", "tamagotchi", "midi", "hamster"],
      sludge: ["popupstorm", "construction", "glitch", "frames"]
    },
    {
      at: 6300, name: "1999 BROADBAND",
      bg: [4, 26, 34], grid: [14, 62, 72], mote: [26, 96, 108],
      hazards: ["ie", "msn", "bsod", "java", "winamp", "hitcounter",
        "napster", "y2k", "imac", "skipintro", "hourglass", "hamster"],
      sludge: ["glitch", "popupstorm", "frames"]
    },
    {
      at: 11700, name: "2001 SPYWARE",
      bg: [32, 8, 16], grid: [78, 21, 36], mote: [124, 36, 54],
      hazards: ["bsod", "ie", "msn", "netscape", "java",
        "bonzi", "toolbars", "iloveyou", "sockpuppet", "hourglass"],
      sludge: ["popupstorm", "glitch"]
    }
  ];

  function zoneAt(distance) {
    var z = 0;
    for (var i = 1; i < ZONES.length; i++) if (distance >= ZONES[i].at) z = i;
    return z;
  }

  function rgb(a) {
    return "rgb(" + (a[0] | 0) + "," + (a[1] | 0) + "," + (a[2] | 0) + ")";
  }

  function easeRGB(cur, tgt, k) {
    for (var i = 0; i < 3; i++) cur[i] += (tgt[i] - cur[i]) * k;
  }

  // Sprites are pre-rendered to offscreen canvases once, then blitted —
  // a 32x32 sprite is 1024 fillRects if you draw it pixel by pixel.
  var _canvas = {};

  function sprite(key) {
    var cv = _canvas[key];
    if (cv) return cv;
    var def = SPRITES[key];
    var rows = def.rows;
    cv = document.createElement("canvas");
    cv.width = rows[0].length;
    cv.height = rows.length;
    var c = cv.getContext("2d");
    for (var r = 0; r < rows.length; r++) {
      var row = rows[r];
      for (var i = 0; i < row.length; i++) {
        var ch = row[i];
        if (ch === ".") continue;
        c.fillStyle = def.palette[ch] || "#fff";
        c.fillRect(i, r, 1, 1);
      }
    }
    _canvas[key] = cv;
    return cv;
  }

  function spriteW(key) { return SPRITES[key].rows[0].length; }
  function spriteH(key) { return SPRITES[key].rows.length; }

  function drawSprite(ctx, key, x, y) {
    ctx.drawImage(sprite(key), Math.round(x), Math.round(y));
  }

  // A flat-coloured copy of a sprite, used to stamp an outline around its
  // real silhouette — so the highlight fits any art without extra grids.
  var _tint = {};

  function silhouette(key, color) {
    var id = key + color;
    var cv = _tint[id];
    if (cv) return cv;
    var src = sprite(key);
    cv = document.createElement("canvas");
    cv.width = src.width;
    cv.height = src.height;
    var c = cv.getContext("2d");
    c.drawImage(src, 0, 0);
    c.globalCompositeOperation = "source-in";
    c.fillStyle = color;
    c.fillRect(0, 0, cv.width, cv.height);
    _tint[id] = cv;
    return cv;
  }

  // Green means take it. Pickups get a crisp 1px outline plus a softer 2px
  // glow that breathes, so they read as friendly at a glance.
  //
  // This exact hue is RESERVED. Nothing that can hurt you may be drawn in it,
  // or near it — a bright green hazard reads as a pickup at speed no matter
  // what shape it is, which is exactly what a green ICQ flower and a neon
  // Winamp used to do. tools/check-sprites.js enforces the reservation, so
  // add a sprite in this green and the build tells you. It is also the only
  // green in the HUD, so "GRAB THE GREEN ONES" is drawn in literally the
  // colour it is describing.
  var GOOD = "#39ff14";
  var RING1 = [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1]];
  var RING2 = [[2, 0], [-2, 0], [0, 2], [0, -2], [2, 1], [2, -1], [-2, 1], [-2, -1],
    [1, 2], [-1, 2], [1, -2], [-1, -2]];

  function drawPickup(ctx, key, x, y, phase) {
    var sil = silhouette(key, GOOD);
    var pulse = 0.5 + 0.5 * Math.sin(phase);
    var i;
    x = Math.round(x);
    y = Math.round(y);
    ctx.globalAlpha = 0.16 + 0.24 * pulse;
    for (i = 0; i < RING2.length; i++) ctx.drawImage(sil, x + RING2[i][0], y + RING2[i][1]);
    ctx.globalAlpha = 0.7 + 0.3 * pulse;
    for (i = 0; i < RING1.length; i++) ctx.drawImage(sil, x + RING1[i][0], y + RING1[i][1]);
    ctx.globalAlpha = 1;
    ctx.drawImage(sprite(key), x, y);
  }

  function rand(a, b) { return a + Math.random() * (b - a); }
  function pick(a) { return a[(Math.random() * a.length) | 0]; }
  function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }

  function pickPowerup() {
    var total = 0, i;
    for (i = 0; i < POWERUPS.length; i++) total += POWERUPS[i].weight;
    var roll = Math.random() * total;
    for (i = 0; i < POWERUPS.length; i++) {
      roll -= POWERUPS[i].weight;
      if (roll <= 0) return POWERUPS[i];
    }
    return POWERUPS[0];
  }

  // ------------------------------------------------------------------
  // Tiny WebAudio blips — no audio files, and it degrades to silence.
  // ------------------------------------------------------------------
  function makeBeeper() {
    var actx = null;
    function ensure() {
      if (!actx) {
        var AC = global.AudioContext || global.webkitAudioContext;
        if (!AC) return null;
        actx = new AC();
      }
      if (actx.state === "suspended") actx.resume();
      return actx;
    }
    return function beep(freq, dur, type, vol) {
      try {
        var ac = ensure();
        if (!ac) return;
        var osc = ac.createOscillator();
        var gain = ac.createGain();
        osc.type = type || "square";
        osc.frequency.value = freq;
        gain.gain.value = vol == null ? 0.05 : vol;
        gain.gain.exponentialRampToValueAtTime(0.0001, ac.currentTime + dur);
        osc.connect(gain).connect(ac.destination);
        osc.start();
        osc.stop(ac.currentTime + dur);
      } catch (e) { /* no audio; ignore */ }
    };
  }

  // ------------------------------------------------------------------
  // Styles, injected once.
  // ------------------------------------------------------------------
  var STYLE_ID = "retro-surfer-style";
  var CSS = [
    ".rsf-wrap{position:relative;display:inline-block;line-height:0;",
    "max-width:100%;touch-action:none;-webkit-user-select:none;user-select:none;",
    "background:#05070f;border:2px solid #2b3550;border-radius:4px;",
    "box-shadow:0 0 0 2px #05070f,0 8px 30px rgba(0,0,0,.5);",
    "font-family:ui-monospace,Menlo,Consolas,monospace;overflow:hidden}",
    ".rsf-wrap:focus{outline:2px solid #54f2ff;outline-offset:2px}",
    ".rsf-wrap canvas{display:block;width:100%;height:auto;",
    "image-rendering:pixelated;image-rendering:crisp-edges}",
    ".rsf-scan{position:absolute;inset:0;pointer-events:none;",
    "background:repeating-linear-gradient(to bottom,rgba(0,0,0,.22) 0 1px,transparent 1px 3px);",
    "mix-blend-mode:multiply}",
    ".rsf-overlay{position:fixed;inset:0;z-index:2147483000;display:flex;",
    "align-items:center;justify-content:center;background:rgba(3,5,12,.92);",
    "backdrop-filter:blur(2px)}",
    ".rsf-close{position:absolute;top:14px;right:16px;background:none;border:0;",
    "color:#8b8fa8;font:700 22px/1 ui-monospace,monospace;cursor:pointer;padding:6px}",
    ".rsf-close:hover{color:#54f2ff}",
    "@media (prefers-reduced-motion:reduce){.rsf-scan{display:none}}"
  ].join("");

  var TOUCH_CAPABLE = (global.navigator && global.navigator.maxTouchPoints > 0) ||
    "ontouchstart" in global;

  function injectStyle() {
    if (document.getElementById(STYLE_ID)) return;
    var s = document.createElement("style");
    s.id = STYLE_ID;
    s.textContent = CSS;
    (document.head || document.documentElement).appendChild(s);
  }

  // ------------------------------------------------------------------
  // Game
  // ------------------------------------------------------------------
  function mount(host, options) {
    if (!host) throw new Error("RetroSurfer.mount: missing host element");
    options = options || {};
    injectStyle();

    var wrap = document.createElement("div");
    wrap.className = "rsf-wrap";
    wrap.tabIndex = 0;
    wrap.setAttribute("role", "application");
    wrap.setAttribute("aria-label", "Retro Surfer, a keyboard-controlled pixel game. Left and right turn the board, down tucks for speed, up brakes, Enter starts.");
    wrap.style.width = (options.width || 420) + "px";

    var canvas = document.createElement("canvas");
    canvas.width = W;
    canvas.height = H;
    wrap.appendChild(canvas);

    var scan = document.createElement("div");
    scan.className = "rsf-scan";
    wrap.appendChild(scan);
    host.appendChild(wrap);

    var ctx = canvas.getContext("2d");
    ctx.imageSmoothingEnabled = false;
    var beep = makeBeeper();

    // --- state ------------------------------------------------------
    var keys = Object.create(null);
    var state, running = true, lastTime = 0, rafId = 0;
    var high = 0;
    try { high = parseInt(global.localStorage.getItem(HIGH_KEY), 10) || 0; } catch (e) {}

    function newState() {
      return {
        mode: "title",        // title | playing | dead
        time: 0,
        distance: 0,
        speed: 130,
        lean: 0,              // degrees, -60..60, + is right
        turnVel: 0,           // deg/sec, eased so turns have weight
        descent: 130,
        pose: 4,
        tucking: false,
        spray: [],
        pops: [],
        combo: 0,
        comboTime: 0,
        chain: 0,
        chainTotal: 0,
        zone: 0,
        bg: ZONES[0].bg.slice(),
        grid: ZONES[0].grid.slice(),
        mote: ZONES[0].mote.slice(),
        lives: 3,
        entities: [],
        spawnGap: 120,
        lastKey: "",
        px: W / 2,
        invuln: 0,
        shield: 0,
        boost: 0,
        charge: 0,          // jump meter, 0..1
        sinceHit: 0,        // sec of clean riding, ramps the fill rate
        airborne: false,
        airTime: 0,
        airHeight: 0,       // eased 0..1, purely visual
        shake: 0,
        drag: 0,              // >0 while wading through sludge
        dragging: false,
        toast: "",
        toastTime: 0,
        paused: false,
        chaser: null,
        chaserTimer: 13,
        escapes: 0,
        flash: 0
      };
    }
    state = newState();

    function say(msg) {
      state.toast = msg;
      state.toastTime = 1.6;
    }

    // little rising score popups
    function pop(text, color) {
      state.pops.push({
        text: text, color: color,
        x: state.px, y: PLAYER_Y - 8, life: 0.9
      });
    }

    // --- input ------------------------------------------------------
    var HANDLED = {
      ArrowLeft: 1, ArrowRight: 1, ArrowUp: 1, ArrowDown: 1,
      Enter: 1, " ": 1, Spacebar: 1
    };

    function onKeyDown(e) {
      var k = e.key;
      if (!HANDLED[k]) return;
      e.preventDefault();
      keys[k] = true;
      // Space is the jump while you're playing, and the start key when
      // you're not — the two can't collide.
      if (k === "Enter" || ((k === " " || k === "Spacebar") && state.mode !== "playing")) {
        if (state.mode !== "playing") start();
      } else if (k === "ArrowDown" && !e.repeat && state.mode === "playing") {
        beep(560, 0.05, "triangle", 0.035);   // tuck, whichever way you point
      }
    }

    function onKeyUp(e) {
      if (!HANDLED[e.key]) return;
      e.preventDefault();
      keys[e.key] = false;
    }

    // Losing focus pauses instead of quietly dying while nobody is looking.
    function onBlur() {
      keys = Object.create(null);
      state.turnVel = 0;
      if (state.mode === "playing") state.paused = true;
    }
    function onFocus() { state.paused = false; }
    function onVisibility() { if (document.hidden) onBlur(); }

    // --- touch ------------------------------------------------------
    // One finger anywhere on the canvas acts as a virtual stick anchored
    // where you first touched: drag sideways to lean (analog, so it feeds the
    // same eased model the keys do), drag down to tuck, up to brake.
    var touch = null;
    var usedTouch = false;
    // A second finger anywhere is the jump button: steer with one thumb,
    // jump with the other, hold for a longer flight.
    var touchJump = false;
    var jumpPointer = null;

    function canvasScale() {
      var r = canvas.getBoundingClientRect();
      return r.width ? W / r.width : 1;
    }

    function onPointerDown(e) {
      wrap.focus();
      if (e.pointerType === "mouse") return;
      e.preventDefault();
      usedTouch = true;
      if (touch) {
        if (jumpPointer === null && state.mode === "playing") {
          jumpPointer = e.pointerId;
          touchJump = true;
          try { wrap.setPointerCapture(e.pointerId); } catch (err) { /* fine */ }
        }
        return;
      }
      touch = {
        id: e.pointerId, x0: e.clientX, y0: e.clientY,
        x: e.clientX, y: e.clientY, moved: 0, t0: Date.now()
      };
      try { wrap.setPointerCapture(e.pointerId); } catch (err) { /* fine */ }
    }

    function onPointerMove(e) {
      if (!touch || e.pointerId !== touch.id) return;
      e.preventDefault();
      touch.moved = Math.max(touch.moved,
        Math.abs(e.clientX - touch.x0) + Math.abs(e.clientY - touch.y0));
      touch.x = e.clientX;
      touch.y = e.clientY;
    }

    function onPointerUp(e) {
      if (jumpPointer !== null && e.pointerId === jumpPointer) {
        jumpPointer = null;
        touchJump = false;
        return;
      }
      if (!touch || e.pointerId !== touch.id) return;
      var tap = touch.moved < 12 && Date.now() - touch.t0 < 400;
      touch = null;
      state.turnVel = 0;
      if (tap && state.mode !== "playing") start();
    }

    wrap.addEventListener("keydown", onKeyDown);
    wrap.addEventListener("keyup", onKeyUp);
    wrap.addEventListener("blur", onBlur);
    wrap.addEventListener("focus", onFocus);
    wrap.addEventListener("pointerdown", onPointerDown);
    wrap.addEventListener("pointermove", onPointerMove);
    wrap.addEventListener("pointerup", onPointerUp);
    wrap.addEventListener("pointercancel", onPointerUp);
    document.addEventListener("visibilitychange", onVisibility);

    function start() {
      var keepHigh = high;
      state = newState();
      state.mode = "playing";
      high = keepHigh;
      beep(440, 0.08);
      setTimeout(function () { beep(660, 0.1); }, 90);
    }

    // --- spawning ---------------------------------------------------
    function level() { return clamp(state.distance / 11000, 0, 1); }
    function baseSpeed() { return 130 + level() * 190; }

    function spawn() {
      var lv = level();
      var roll = Math.random();
      var zone = ZONES[state.zone];
      var key, kind = "obstacle", power = null;

      if (roll < 0.14) {
        power = pickPowerup();
        key = power.key;
        kind = "powerup";
      } else if (roll < 0.14 + 0.20 + lv * 0.05) {
        key = pick(zone.sludge);
        if (key === state.lastKey) key = pick(zone.sludge);
        kind = "sludge";
      } else {
        key = pick(zone.hazards);
        if (key === state.lastKey) key = pick(zone.hazards);   // less clumping
      }
      state.lastKey = key;

      var w = spriteW(key);
      var x = rand(6, W - w - 6);

      // Don't stack a new entity on top of one that just spawned.
      for (var i = 0; i < state.entities.length; i++) {
        var e = state.entities[i];
        if (e.y > H - 70 &&
          Math.abs((e.x + e.w / 2) - (x + w / 2)) < (e.w + w) / 2 + 14) return;
      }

      state.entities.push({
        key: key, kind: kind, power: power,
        x: x, y: H + 8, w: w, h: spriteH(key),
        drift: kind === "obstacle" ? rand(-10, 10) * lv : 0,
        bob: Math.random() * Math.PI * 2
      });
    }

    // --- collisions -------------------------------------------------
    // Normally a tight box around the puma's body, not the whole 32x32 cell.
    // With Norton up, the bubble itself is what collides — the drawn circle
    // and the hitbox are the same shape, so it never eats a hit that looks
    // like a miss. It is a bigger target than the bare body, which is the
    // trade for absorbing a hit.
    function hits(e) {
      var bx = e.x + 4, by = e.y + 4, bw = e.w - 8, bh = e.h - 8;
      if (state.shield > 0) {
        var cx = state.px, cy = PLAYER_Y + 16;
        var nx = clamp(cx, bx, bx + bw), ny = clamp(cy, by, by + bh);
        var dx = cx - nx, dy = cy - ny;
        return dx * dx + dy * dy <= SHIELD_R * SHIELD_R;
      }
      var ax = state.px - 7, ay = PLAYER_Y + 6, aw = 14, ah = 20;
      return ax < bx + bw && ax + aw > bx && ay < by + bh && ay + ah > by;
    }

    function damage(label) {
      if (state.invuln > 0 || state.airborne) return;
      if (state.shield > 0) {
        state.shield = 0;
        state.invuln = 1;
        state.shake = 5;
        say("SHIELD BURNED");
        beep(220, 0.16, "sawtooth");
        return;
      }
      state.lives--;
      state.combo = 0;
      state.sinceHit = 0;          // a knock costs the meters momentum too
      state.invuln = 1.4;
      state.speed *= 0.5;
      state.lean = 0;          // a crash stands you back up
      state.turnVel = 0;
      state.shake = 7;
      state.flash = 0.18;
      say(label || "CRASH");
      beep(150, 0.22, "sawtooth");
      if (state.chaser) state.chaser.gap = Math.max(40, state.chaser.gap - 55);
      if (state.lives <= 0) gameOver();
    }

    function gameOver() {
      state.mode = "dead";
      state.lives = 0;
      var kb = score();
      if (kb > high) {
        high = kb;
        try { global.localStorage.setItem(HIGH_KEY, String(high)); } catch (e) {}
      }
      beep(180, 0.3, "sawtooth");
      setTimeout(function () { beep(120, 0.4, "sawtooth"); }, 160);
    }

    function score() { return Math.floor(state.distance / 9); }

    function collect(e) {
      var kind = e.power.kind;
      if (kind === "shield") {
        state.shield = 9;
        say("NORTON ONLINE");
        if (state.chaser) state.chaser.fleeing = true;
        beep(880, 0.1); setTimeout(function () { beep(1180, 0.12); }, 80);
      } else if (kind === "boost") {
        state.boost = 4.5;
        say("BROADBAND");
        beep(700, 0.08); setTimeout(function () { beep(1000, 0.08); }, 60);
      } else if (kind === "jump") {
        startLinkChain();
      } else if (kind === "life") {
        state.lives = Math.min(5, state.lives + 1);
        say("FILE SAVED  +1");
        beep(520, 0.09); setTimeout(function () { beep(780, 0.12); }, 80);
      }
    }

    // --- hyperlink chain --------------------------------------------
    // Taking a hyperlink doesn't just make you briefly untouchable — it opens
    // a trail of links ahead and puts you in the air to surf them. Airborne
    // you fly rather than carve, so leaning costs no descent: the chain is a
    // weaving run you have to actually fly, and the links only exist while
    // you're up there.
    // Lay the rest of the chain as a straight line running off in the
    // direction you are travelling right now. Every link you take re-aims it
    // from where you're pointing at that instant, so the trick is to take
    // each one on a heading you actually mean to hold — swerve as you touch
    // it and the rest of the chain swings away with you.
    function layChain(count) {
      for (var j = state.entities.length - 1; j >= 0; j--) {
        if (state.entities[j].kind === "link") state.entities.splice(j, 1);
      }
      // Straight along the way you're actually travelling — which on the
      // ground is simply where the board points.
      var ang = state.lean * Math.PI / 180;
      var vx = Math.sin(ang), vy = Math.cos(ang);
      var w = spriteW("link"), h = spriteH("link");
      var laid = 0;
      for (var i = 0; i < count; i++) {
        var d = LINK_GAP * (i + 1);
        var lx = state.px + vx * d - w / 2;
        // The line stops where it runs off the field rather than clamping:
        // clamped links stack on the same pixel at the wall, which you could
        // then sweep up in one go. A heading into the wall is simply a
        // shorter chain — which is the game telling you it's a bad heading.
        if (lx < 6 || lx > W - w - 6) break;
        state.entities.push({
          key: "link", kind: "link",
          x: lx, y: PLAYER_Y + vy * d,
          w: w, h: h,
          drift: 0, bob: Math.random() * Math.PI * 2
        });
        laid++;
      }
      // only ever promise what actually fits on the field
      state.chainTotal = state.chain + laid;
    }

    function startLinkChain() {
      state.chain = 0;
      state.chainTotal = LINK_COUNT;
      layChain(LINK_COUNT);
      say("HYPERLINK OPEN");
      beep(600, 0.07);
      setTimeout(function () { beep(900, 0.09); }, 70);
      if (state.chainTotal <= 0) resolveChain(false);
    }

    function grabLink() {
      state.chain++;
      state.distance += 18 * 9;
      pop("+18KB", "#54f2ff");
      beep(760 + state.chain * 120, 0.06, "triangle", 0.04);
      layChain(state.chainTotal - state.chain);   // re-aim from here
      if (state.chainTotal <= state.chain) resolveChain(true);
    }

    // A chain ends the moment a link goes by uncollected — miss one and the
    // rest of the line goes with it.
    function resolveChain(complete) {
      for (var i = state.entities.length - 1; i >= 0; i--) {
        if (state.entities[i].kind === "link") state.entities.splice(i, 1);
      }
      if (complete && state.chainTotal > 0) {
        // scaled by length so a deliberately short chain laid into a wall
        // isn't a cheap way to farm the completion bonus
        var bonus = 18 * state.chainTotal;
        state.distance += bonus * 9;
        say("CHAIN COMPLETE  +" + bonus + "KB");
        beep(1000, 0.09);
        setTimeout(function () { beep(1400, 0.14); }, 90);
      } else if (state.chain > 0) {
        say(state.chain + "/" + state.chainTotal + " LINKS");
        beep(240, 0.12, "sawtooth", 0.035);
      }
      state.chain = 0;
      state.chainTotal = 0;
    }

    // --- near misses ------------------------------------------------
    // Threading a hazard pays, and paying more the closer you cut it is what
    // makes the greedy line worth taking. Chain them for a multiplier.
    function nearMiss(gap) {
      state.combo++;
      state.comboTime = 3.5;
      var mult = 1 + Math.min(state.combo - 1, 4) * 0.5;      // up to 3x
      var kb = Math.round((5 + (1 - gap / NEAR_MISS) * 12) * mult);
      state.distance += kb * 9;
      pop("+" + kb + "KB" + (state.combo > 1 ? " X" + state.combo : ""), "#54f2ff");
      beep(1150 + Math.min(state.combo, 6) * 95, 0.05, "triangle", 0.035);
    }

    // --- chaser -----------------------------------------------------
    function spawnChaser() {
      state.chaser = { gap: 230, x: state.px, fleeing: false };
      say("IT LOOKS LIKE YOU'RE FLEEING");
      state.shake = 6;
      beep(90, 0.5, "sawtooth", 0.07);
    }

    // It runs at a fixed downhill speed, so carving sideways or braking
    // hands it ground and only pointing straight down pulls away.
    function updateChaser(dt, descent) {
      var c = state.chaser;
      if (!c) {
        state.chaserTimer -= dt;
        if (state.chaserTimer <= 0 && state.distance > 1400) spawnChaser();
        return;
      }
      c.x += (state.px - c.x) * Math.min(1, dt * 2.4);
      if (state.shield > 0) c.fleeing = true;

      if (c.fleeing) c.gap += 320 * dt;
      else c.gap += (descent - baseSpeed() * 0.97) * 0.55 * dt;

      if (c.gap > 300) {
        state.chaser = null;
        state.escapes++;
        state.chaserTimer = rand(15, 25);
        state.distance += 450;
        say("ASSISTANT DISMISSED");
        beep(900, 0.12); setTimeout(function () { beep(1300, 0.14); }, 90);
        return;
      }
      if (c.gap <= 26) {
        if (state.invuln > 0) return;
        damage("NEED HELP WITH THAT?");
        c.gap = 220;
        c.fleeing = false;
      }
    }

    // --- carve spray ------------------------------------------------
    // Kicked off the inside edge when you lean hard or stand on the brakes.
    // World-anchored, so it streams away up-track like real spray.
    function updateSpray(dt, descent) {
      var i, p;
      var hard = Math.abs(state.lean) > 24;
      if ((hard || state.speed < baseSpeed() * 0.7) && !state.airborne && state.speed > 70 &&
        state.spray.length < 70) {
        var side = hard ? (state.lean > 0 ? 1 : -1) : (Math.random() < 0.5 ? 1 : -1);
        var n = hard ? 2 : 1;
        for (i = 0; i < n; i++) {
          state.spray.push({
            x: state.px + side * rand(4, 11),
            y: PLAYER_Y + rand(18, 28),
            vx: side * rand(18, 70),
            vy: rand(-10, 30),
            life: rand(0.22, 0.5),
            max: 0.5
          });
        }
      }
      for (i = state.spray.length - 1; i >= 0; i--) {
        p = state.spray[i];
        p.life -= dt;
        if (p.life <= 0) { state.spray.splice(i, 1); continue; }
        p.x += p.vx * dt;
        p.y += p.vy * dt - descent * dt;   // the world scrolls out from under it
        p.vx *= 0.94;
      }
    }

    // --- update -----------------------------------------------------
    function update(dt) {
      if (state.mode !== "playing" || state.paused) return;
      state.time += dt;

      // Steering: held keys drive an eased turn rate rather than snapping to
      // fixed positions, so a tap is a nudge and a hold is a full carve.
      // A finger on the canvas steers to an absolute lean instead.
      var input = 0, touchTuck = false, touchBrake = false;
      if (touch) {
        var sc = canvasScale();
        var tdx = (touch.x - touch.x0) * sc;
        var tdy = (touch.y - touch.y0) * sc;
        var want = clamp(tdx / 46, -1, 1) * MAX_LEAN;
        state.lean += (want - state.lean) * Math.min(1, dt * 9);
        state.turnVel = 0;
        input = tdx > 6 ? 1 : tdx < -6 ? -1 : 0;
        touchTuck = tdy > 14;
        touchBrake = tdy < -14;
      } else {
        if (keys.ArrowLeft) input -= 1;
        if (keys.ArrowRight) input += 1;
        state.turnVel += (input * TURN_RATE - state.turnVel) * Math.min(1, dt * TURN_EASE);
        state.lean = clamp(state.lean + state.turnVel * dt, -MAX_LEAN, MAX_LEAN);
        if (state.lean <= -MAX_LEAN || state.lean >= MAX_LEAN) state.turnVel *= 0.35;
      }

      var pose = clamp(Math.round((state.lean + MAX_LEAN) / POSE_STEP), 0, POSE.length - 1);
      if (pose !== state.pose) {
        state.pose = pose;
        beep(300 + Math.abs(pose - 4) * 55, 0.035, "triangle", 0.022);
      }

      var mult = 1;
      state.tucking = !!(keys.ArrowDown || touchTuck);
      if (state.tucking) mult = 1.28;                  // tuck, along the board
      else if (keys.ArrowUp || touchBrake) mult = 0.5; // brake
      if (state.boost > 0) mult *= 1.5;
      if (state.drag > 0) mult *= 0.3;        // bogged down in the junk

      var target = baseSpeed() * mult;
      state.speed += (target - state.speed) * Math.min(1, dt * 3);

      // On the ground you travel along the board, so carving trades descent
      // for lateral speed. In the air you're flying: lean steers you across
      // the field and costs nothing downhill, which is what makes the chain
      // flyable — and what makes the jump a real escape from the virus.
      var ang = state.lean * Math.PI / 180;
      var descent = state.speed * Math.cos(ang);
      var lateral = state.speed * Math.sin(ang);
      state.descent = descent;
      state.distance += descent * dt;

      var wanted = state.px + lateral * dt;
      state.px = clamp(wanted, 17, W - 17);
      // scrubbing along an edge with nobody steering: stand back up rather
      // than sit there pinned at full lean going nowhere
      if (wanted !== state.px && input === 0) {
        state.lean += (0 - state.lean) * Math.min(1, dt * 3);
      }

      updateSpray(dt, descent);

      // timers
      state.invuln = Math.max(0, state.invuln - dt);
      state.shield = Math.max(0, state.shield - dt);
      state.boost = Math.max(0, state.boost - dt);

      // --- jump meter -------------------------------------------------
      // Hold to stay up; the meter drains while you're airborne and refills
      // only on clean ground. Nothing refills it mid-flight, so a long jump
      // and three hops cost exactly the same bar.
      var wantJump = !!(keys[" "] || keys.Spacebar || touchJump);
      if (state.airborne) {
        state.airTime += dt;
        state.charge = Math.max(0, state.charge - AIR_DRAIN * dt);
        if (state.charge <= 0 || (!wantJump && state.airTime >= MIN_AIR)) {
          state.airborne = false;
          beep(300, 0.05, "triangle", 0.03);
        }
      } else {
        if (wantJump && state.charge >= MIN_JUMP) {
          state.airborne = true;
          state.airTime = 0;
          beep(720, 0.06, "triangle", 0.04);
        } else {
          // A knock stops the meter dead and resets the ramp; wading through
          // junk stalls it too, without costing the ramp you've built.
          state.sinceHit += dt;
          if (state.invuln <= 0 && state.drag <= 0) {
            var ramp = clamp(state.sinceHit / JUMP_RAMP, 0, 1);
            state.charge = clamp(
              state.charge + JUMP_FILL * (state.descent / JUMP_REF) * ramp * dt, 0, 1);
          }
        }
      }
      state.airHeight += ((state.airborne ? 1 : 0) - state.airHeight) * Math.min(1, dt * 9);
      state.shake = Math.max(0, state.shake - dt * 14);
      state.drag = Math.max(0, state.drag - dt);
      if (state.drag <= 0) state.dragging = false;
      state.comboTime = Math.max(0, state.comboTime - dt);
      if (state.comboTime <= 0) state.combo = 0;

      // score popups drift up and fade
      for (var pi = state.pops.length - 1; pi >= 0; pi--) {
        var pp = state.pops[pi];
        pp.life -= dt;
        pp.y -= 24 * dt;
        if (pp.life <= 0) state.pops.splice(pi, 1);
      }

      // era transitions: repaint the world, swap the junk
      var zi = zoneAt(state.distance);
      if (zi !== state.zone) {
        state.zone = zi;
        say("ENTERING " + ZONES[zi].name);
        beep(700, 0.09); setTimeout(function () { beep(1050, 0.14); }, 100);
      }
      var z = ZONES[state.zone], k = Math.min(1, dt * 1.3);
      easeRGB(state.bg, z.bg, k);
      easeRGB(state.grid, z.grid, k);
      easeRGB(state.mote, z.mote, k);
      state.flash = Math.max(0, state.flash - dt);
      state.toastTime = Math.max(0, state.toastTime - dt);

      // Spawn by distance covered, not elapsed time: tucking then means
      // more obstacles per second rather than a thinner field.
      state.spawnGap -= descent * dt;
      if (state.spawnGap <= 0) {
        spawn();
        state.spawnGap = rand(72, 150) - level() * 26;
      }

      // entities scroll up past the player at your descent rate
      for (var i = state.entities.length - 1; i >= 0; i--) {
        var e = state.entities[i];
        e.y -= descent * dt;
        e.x += e.drift * dt;
        if (e.y + e.h < -10) { state.entities.splice(i, 1); continue; }

        // Sludge is a field you wade through — it is never consumed and
        // never hurts, it just refuses to let you go fast.
        if (e.kind === "sludge") {
          if (!state.airborne && hits(e)) {
            state.drag = 0.12;
            if (!state.dragging) {
              state.dragging = true;
              say(SPRITES[e.key].label);
              beep(110, 0.3, "sawtooth", 0.045);
            }
          }
          continue;
        }

        // chain links: only live while you're airborne, and only reachable
        // by flying through them
        if (e.kind === "link") {
          if (hits(e)) {
            state.entities.splice(i, 1);
            grabLink();
          }
          continue;
        }

        // pickups reach for you once you're close, so a near-perfect line
        // still counts
        if (e.kind === "powerup") {
          var mdx = state.px - (e.x + e.w / 2);
          var mdy = (PLAYER_Y + 16) - (e.y + e.h / 2);
          var md = Math.sqrt(mdx * mdx + mdy * mdy);
          if (md > 0.01 && md < MAGNET) {
            var pull = (1 - md / MAGNET) * 170 * dt;
            e.x += mdx / md * pull;
            e.y += mdy / md * pull;
          }
        }

        if (hits(e)) {
          if (e.kind === "powerup") {
            state.entities.splice(i, 1);
            collect(e);
          } else if (!state.airborne && state.invuln <= 0) {
            state.entities.splice(i, 1);
            damage(SPRITES[e.key].label);
          }
          continue;
        }

        // cleared it — how close was that?
        if (e.kind === "obstacle" && !e.scored && e.y + e.h < PLAYER_Y + 8) {
          e.scored = true;
          if (!state.airborne && state.invuln <= 0) {
            var clear = Math.abs(state.px - (e.x + e.w / 2)) - 7 - (e.w - 8) / 2;
            if (clear >= 0 && clear < NEAR_MISS) nearMiss(clear);
          }
        }
      }

      updateChaser(dt, descent);
    }

    // --- render -----------------------------------------------------
    function drawBackground() {
      ctx.fillStyle = rgb(state.bg);
      ctx.fillRect(0, 0, W, H);

      // scrolling cyber grid
      var off = state.distance % 40;
      ctx.fillStyle = rgb(state.grid);
      for (var y = -40 + off; y < H; y += 40) ctx.fillRect(0, Math.round(y), W, 1);
      for (var x = 0; x < W; x += 40) ctx.fillRect(x, 0, 1, H);

      // data motes drifting up — they stretch into streaks as you pick up
      // speed, so the screen reads faster without a separate effect
      var streak = clamp(state.descent / 55, 2, 11);
      ctx.fillStyle = rgb(state.mote);
      for (var i = 0; i < 34; i++) {
        var sx = (i * 97) % W;
        var sy = ((i * 149 + state.distance * (0.6 + (i % 3) * 0.25)) % H);
        ctx.fillRect(sx, H - Math.round(sy), 2, Math.round(streak * (0.6 + (i % 3) * 0.2)));
      }
    }

    function drawHud() {
      ctx.fillStyle = "#05070f";
      ctx.fillRect(0, 0, W, 24);
      ctx.fillStyle = "#2b3550";
      ctx.fillRect(0, 24, W, 1);

      drawText(ctx, score() + " KB", 6, 7, "#54f2ff", 2);
      var hi = "HI " + high;
      drawText(ctx, hi, W - textWidth(hi, 2) - 6, 7, "#8b8fa8", 2);

      // lives as little floppies
      for (var i = 0; i < state.lives; i++) drawSprite(ctx, "life", 150 + i * 15, 6);

      // powerup timers
      var y = 30;
      if (state.shield > 0) { drawText(ctx, "SHIELD " + Math.ceil(state.shield), 6, y, "#ffcc33", 2); y += 14; }
      if (state.boost > 0) { drawText(ctx, "TURBO " + Math.ceil(state.boost), 6, y, "#54f2ff", 2); y += 14; }
      if (state.chainTotal > 0) {
        drawText(ctx, "LINKS " + state.chain + "/" + state.chainTotal, 6, y, "#2b6ef6", 2);
      }

      var baud = Math.round(state.descent * 200);
      drawText(ctx, baud + " BPS", W - textWidth(baud + " BPS", 2) - 6, 30,
        state.drag > 0 ? "#ff3355" : GOOD, 2);

      var era = ZONES[state.zone].name;
      drawText(ctx, era, Math.round((W - textWidth(era, 2)) / 2), 30, "#6b7398", 2);

      if (state.toastTime > 0) {
        ctx.fillStyle = "#05070f";
        ctx.fillRect(0, H - 30, W, 18);
        ctx.fillStyle = "#2b3550";
        ctx.fillRect(0, H - 31, W, 1);
        drawTextCentered(ctx, state.toast, H - 26, state.toastTime > 1.2 ? "#ffffff" : "#8b8fa8", 2);
      }

      // Jump meter, sitting in the bottom status bar like a browser's
      // download progress. Frozen while you're flashing or bogged down, so
      // a stalled bar explains itself.
      var by = H - 8, bx0 = 26, bw = W - bx0 - 4;
      ctx.fillStyle = "#05070f";
      ctx.fillRect(0, H - 10, W, 10);
      var frozen = state.invuln > 0 || state.drag > 0;
      drawText(ctx, "JUMP", 4, by, frozen ? "#8b4a55" : "#8b8fa8", 1);
      ctx.fillStyle = "#16224d";
      ctx.fillRect(bx0, by - 1, bw, 7);
      var fillW = Math.round(bw * state.charge);
      if (fillW > 0) {
        ctx.fillStyle = state.charge >= 1
          ? (Math.floor(state.time * 6) % 2 ? "#ffffff" : "#54f2ff")
          : state.charge >= MIN_JUMP ? "#54f2ff" : "#2b6ef6";
        ctx.fillRect(bx0, by - 1, fillW, 7);
      }
      if (frozen) {                       // hatch the track when stalled
        ctx.fillStyle = "rgba(255,51,85,.5)";
        for (var hx = bx0; hx < bx0 + bw; hx += 4) ctx.fillRect(hx, by - 1, 1, 7);
      }
      // the notch you need to reach before you can leave the ground at all
      ctx.fillStyle = "#0a0d18";
      ctx.fillRect(bx0 + Math.round(bw * MIN_JUMP), by - 1, 1, 7);
    }

    function drawSpray() {
      for (var i = 0; i < state.spray.length; i++) {
        var p = state.spray[i];
        var f = p.life / p.max;
        ctx.fillStyle = f > 0.6 ? "#e8ecff" : f > 0.3 ? "#7fd4ff" : "#3aa0ff";
        ctx.globalAlpha = clamp(f * 1.4, 0, 1);
        ctx.fillRect(Math.round(p.x), Math.round(p.y), 2, 2);
      }
      ctx.globalAlpha = 1;
    }

    function drawPlayer() {
      var x = state.px - 16;
      var y = PLAYER_Y;
      var scale = 1;

      // Height is eased rather than an arc over a fixed duration, because a
      // jump now lasts as long as you hold it.
      if (state.airHeight > 0.02) {
        var arc = state.airHeight;
        ctx.fillStyle = "rgba(0,0,0," + (0.45 * arc).toFixed(2) + ")";
        ctx.fillRect(Math.round(x + 8), y + 28, 16, 4);
        y -= arc * 22;
        scale = 1 + arc * 0.28;      // reads as height, not just a lift
      }

      // Shield bubble. Plotted point by point rather than with arc() so it
      // stays crisp — a stroked path anti-aliases into a soft grey ring at
      // this resolution. Radius is SHIELD_R, the same circle hits() uses.
      if (state.shield > 0 && !(state.shield < 2.5 && Math.floor(state.shield * 8) % 2 === 0)) {
        var bcx = state.px, bcy = y + 16;
        ctx.fillStyle = "#ffcc33";
        for (var a = 0; a < 6.2832; a += 0.045) {
          ctx.fillRect(Math.round(bcx + Math.cos(a) * SHIELD_R),
            Math.round(bcy + Math.sin(a) * SHIELD_R), 1, 1);
        }
        ctx.fillStyle = "rgba(255,204,51,.10)";
        ctx.beginPath();
        ctx.arc(bcx, bcy, SHIELD_R, 0, 6.2832);
        ctx.fill();
      }

      if (state.boost > 0) {
        ctx.fillStyle = "#54f2ff";
        for (var i = 0; i < 4; i++) {
          ctx.fillRect(Math.round(x + 6 + i * 6), Math.round(y - 8 - (i % 2) * 4), 2, 7);
        }
      }

      if (state.invuln > 0 && Math.floor(state.time * 14) % 2 === 0) return;
      // crouched art while tucking — you can see the speed, not just read it
      var key = (state.tucking ? TUCK : POSE)[state.pose];
      if (scale === 1) {
        drawSprite(ctx, key, x, y);
      } else {
        var d = Math.round(32 * scale);
        ctx.drawImage(sprite(key),
          Math.round(x - (d - 32) / 2), Math.round(y - (d - 32) / 2), d, d);
      }
    }

    function drawChaser() {
      var c = state.chaser;
      if (!c) return;
      var cy = PLAYER_Y - c.gap;
      drawSprite(ctx, "clippy", c.x - 32, cy);

      // Telegraph it while it's still above the top edge, so being hunted is
      // never a surprise you couldn't see coming.
      if (cy + 64 < 44 && !c.fleeing && Math.floor(state.time * 4) % 2 === 0) {
        ctx.fillStyle = "#ff3355";
        for (var i = 0; i < 9; i++) {
          ctx.fillRect(Math.round(c.x) - (8 - i), 46 + i, (8 - i) * 2 + 1, 1);
        }
      }
      // Clear of the era label on the HUD's second row. This shares a row
      // with the off-screen chevron above, which is safe: that shows only
      // when the chaser is further back than this warning's range.
      if (c.gap < 140 && !c.fleeing && Math.floor(state.time * 5) % 2 === 0) {
        drawTextCentered(ctx, "BEHIND YOU", 48, "#ff3355", 2);
      }
    }

    function startPrompt() {
      return usedTouch ? "TAP TO START"
        : TOUCH_CAPABLE ? "TAP OR PRESS ENTER" : "PRESS ENTER";
    }

    function drawTitle() {
      ctx.fillStyle = "rgba(5,7,15,.82)";
      ctx.fillRect(0, 0, W, H);
      drawTextCentered(ctx, "RETRO", 70, "#54f2ff", 5);
      drawTextCentered(ctx, "SURFER", 106, "#54f2ff", 5);
      drawTextCentered(ctx, "'96", 142, "#ff9f1c", 3);

      drawTextCentered(ctx, "RIDE THE INFORMATION", 186, "#8b8fa8", 2);
      drawTextCentered(ctx, "SUPERHIGHWAY", 202, "#8b8fa8", 2);

      if (usedTouch) {
        drawText(ctx, "DRAG", 40, 228, "#e8ecff", 2);
        drawText(ctx, "SIDEWAYS TO LEAN", 104, 228, "#8b8fa8", 2);
        drawText(ctx, "DRAG", 40, 244, "#e8ecff", 2);
        drawText(ctx, "DOWN TO TUCK", 104, 244, "#8b8fa8", 2);
        drawText(ctx, "DRAG", 40, 260, "#e8ecff", 2);
        drawText(ctx, "UP TO BRAKE", 104, 260, "#8b8fa8", 2);
        drawText(ctx, "2 FING", 40, 276, "#54f2ff", 2);
        drawText(ctx, "HOLD TO JUMP", 104, 276, "#8b8fa8", 2);
      } else {
        drawText(ctx, "< >", 56, 228, "#e8ecff", 2);
        drawText(ctx, "HOLD TO CARVE", 138, 228, "#8b8fa8", 2);
        drawText(ctx, "DOWN", 56, 244, "#e8ecff", 2);
        drawText(ctx, "TUCK", 138, 244, "#8b8fa8", 2);
        drawText(ctx, "UP", 56, 260, "#e8ecff", 2);
        drawText(ctx, "BRAKE", 138, 260, "#8b8fa8", 2);
        drawText(ctx, "SPACE", 56, 276, "#54f2ff", 2);
        drawText(ctx, "HOLD TO JUMP", 138, 276, "#8b8fa8", 2);
      }

      drawPickup(ctx, "norton", 52, 296, state.time * 5);
      drawPickup(ctx, "bolt", 90, 296, state.time * 5 + 1);
      drawPickup(ctx, "portal", 128, 296, state.time * 5 + 2);
      drawPickup(ctx, "floppy", 166, 296, state.time * 5 + 3);
      drawSprite(ctx, "clippy", 202, 292);
      drawTextCentered(ctx, "GRAB THE GREEN ONES", 364, GOOD, 2);
      drawTextCentered(ctx, "BIG JUNK JUST SLOWS YOU", 382, "#8b8fa8", 2);

      if (Math.floor(state.time * 2) % 2 === 0) {
        drawTextCentered(ctx, startPrompt(), 404, GOOD, 2);
      }
      if (high > 0) drawTextCentered(ctx, "BEST " + high + " KB", 430, "#8b8fa8", 2);
    }

    function drawDead() {
      ctx.fillStyle = "rgba(5,7,15,.85)";
      ctx.fillRect(0, 0, W, H);
      drawTextCentered(ctx, "CONNECTION", 130, "#ff3355", 4);
      drawTextCentered(ctx, "LOST", 164, "#ff3355", 4);
      drawTextCentered(ctx, "DOWNLOADED", 216, "#8b8fa8", 2);
      drawTextCentered(ctx, score() + " KB", 234, "#54f2ff", 4);
      drawTextCentered(ctx, "BEST " + high + " KB", 268, "#8b8fa8", 2);
      if (state.escapes > 0) {
        drawTextCentered(ctx, state.escapes + " ASSISTS DODGED", 288, GOOD, 2);
      }
      if (Math.floor(state.time * 2) % 2 === 0) {
        drawTextCentered(ctx, startPrompt(), 340, GOOD, 2);
      }
    }

    function render() {
      ctx.save();
      if (state.shake > 0) {
        ctx.translate(Math.round(rand(-state.shake, state.shake)), Math.round(rand(-state.shake, state.shake)));
      }

      drawBackground();

      // layered: sludge sits under the hazards, pickups always on top
      var i, e;
      for (i = 0; i < state.entities.length; i++) {
        e = state.entities[i];
        if (e.kind !== "sludge") continue;
        // corrupted data won't hold still
        var jx = e.key === "glitch" ? (Math.floor(state.time * 14) % 3 - 1) * 2 : 0;
        drawSprite(ctx, e.key, e.x + jx, e.y);
      }
      for (i = 0; i < state.entities.length; i++) {
        e = state.entities[i];
        if (e.kind === "obstacle") drawSprite(ctx, e.key, e.x, e.y);
      }
      for (i = 0; i < state.entities.length; i++) {
        e = state.entities[i];
        if (e.kind === "powerup" || e.kind === "link") {
          drawPickup(ctx, e.key, e.x, e.y + Math.sin(state.time * 6 + e.bob) * 2,
            state.time * 5 + e.bob);
        }
      }

      drawChaser();
      if (state.mode !== "title") { drawSpray(); drawPlayer(); }

      for (i = 0; i < state.pops.length; i++) {
        var pp = state.pops[i];
        ctx.globalAlpha = clamp(pp.life * 2.2, 0, 1);
        drawText(ctx, pp.text, Math.round(pp.x - textWidth(pp.text, 2) / 2),
          Math.round(pp.y), pp.color, 2);
        ctx.globalAlpha = 1;
      }
      if (state.mode !== "title") drawHud();

      // wading through junk tears up the picture
      if (state.drag > 0) {
        for (i = 0; i < 7; i++) {
          ctx.fillStyle = i % 2 ? "rgba(255,60,224,.26)" : "rgba(84,242,255,.26)";
          ctx.fillRect(0, (Math.random() * H) | 0, W, 1 + ((Math.random() * 4) | 0));
        }
      }

      if (state.flash > 0) {
        ctx.fillStyle = "rgba(255,51,85," + (state.flash * 2) + ")";
        ctx.fillRect(0, 0, W, H);
      }
      ctx.restore();

      if (state.mode === "title") drawTitle();
      else if (state.mode === "dead") drawDead();
      else if (state.paused) {
        ctx.fillStyle = "rgba(5,7,15,.8)";
        ctx.fillRect(0, 0, W, H);
        drawTextCentered(ctx, "PAUSED", 210, "#54f2ff", 4);
        drawTextCentered(ctx, "CLICK TO RESUME", 246, "#8b8fa8", 2);
      }
    }

    // --- loop -------------------------------------------------------
    function frame(now) {
      if (!running) return;
      rafId = requestAnimationFrame(frame);
      if (!lastTime) lastTime = now;
      var dt = Math.min(0.05, (now - lastTime) / 1000);
      lastTime = now;
      if (state.mode !== "playing") state.time += dt; // keeps blinkers alive
      update(dt);
      render();
    }
    rafId = requestAnimationFrame(frame);

    if (options.autofocus !== false) {
      setTimeout(function () { wrap.focus(); }, 0);
    }

    return {
      element: wrap,
      focus: function () { wrap.focus(); },
      destroy: function () {
        running = false;
        cancelAnimationFrame(rafId);
        wrap.removeEventListener("keydown", onKeyDown);
        wrap.removeEventListener("keyup", onKeyUp);
        wrap.removeEventListener("blur", onBlur);
        wrap.removeEventListener("focus", onFocus);
        wrap.removeEventListener("pointerdown", onPointerDown);
        document.removeEventListener("visibilitychange", onVisibility);
        if (wrap.parentNode) wrap.parentNode.removeChild(wrap);
      }
    };
  }

  // ------------------------------------------------------------------
  // Overlay + Konami-code entry point, for actual easter-egg duty.
  // ------------------------------------------------------------------
  var activeOverlay = null;

  function open(options) {
    if (activeOverlay) return activeOverlay;
    injectStyle();
    var overlay = document.createElement("div");
    overlay.className = "rsf-overlay";

    var close = document.createElement("button");
    close.className = "rsf-close";
    close.type = "button";
    close.textContent = "×";
    close.setAttribute("aria-label", "Close game");
    overlay.appendChild(close);

    var holder = document.createElement("div");
    overlay.appendChild(holder);
    document.body.appendChild(overlay);

    var game = mount(holder, options || { width: 420 });

    function shut() {
      document.removeEventListener("keydown", onEsc, true);
      game.destroy();
      if (overlay.parentNode) overlay.parentNode.removeChild(overlay);
      activeOverlay = null;
    }
    function onEsc(e) { if (e.key === "Escape") shut(); }

    close.addEventListener("click", shut);
    overlay.addEventListener("click", function (e) { if (e.target === overlay) shut(); });
    document.addEventListener("keydown", onEsc, true);

    activeOverlay = { close: shut, game: game };
    return activeOverlay;
  }

  var KONAMI = ["ArrowUp", "ArrowUp", "ArrowDown", "ArrowDown", "ArrowLeft",
    "ArrowRight", "ArrowLeft", "ArrowRight", "b", "a"];

  function konami(options) {
    var idx = 0;
    function onKey(e) {
      if (activeOverlay || e.repeat) return;
      var want = KONAMI[idx];
      var got = e.key.length === 1 ? e.key.toLowerCase() : e.key;
      idx = got === want ? idx + 1 : (got === KONAMI[0] ? 1 : 0);
      if (idx === KONAMI.length) {
        idx = 0;
        open(options);
      }
    }
    document.addEventListener("keydown", onKey);
    return function () { document.removeEventListener("keydown", onKey); };
  }

  var RetroSurfer = {
    mount: mount, open: open, konami: konami,
    sprites: SPRITES, VERSION: "2.0.0"
  };

  if (typeof module === "object" && module.exports) module.exports = RetroSurfer;
  global.RetroSurfer = RetroSurfer;

  function autoMount() {
    var nodes = document.querySelectorAll("[data-retro-surfer]");
    for (var i = 0; i < nodes.length; i++) {
      var el = nodes[i];
      if (el.__rsfMounted) continue;
      el.__rsfMounted = true;
      mount(el, {
        width: parseInt(el.getAttribute("data-width"), 10) || 420,
        // Inline mounts don't steal focus unless asked; the overlay does.
        autofocus: el.getAttribute("data-autofocus") === "true"
      });
    }
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", autoMount);
  } else {
    autoMount();
  }
})(typeof window !== "undefined" ? window : this);

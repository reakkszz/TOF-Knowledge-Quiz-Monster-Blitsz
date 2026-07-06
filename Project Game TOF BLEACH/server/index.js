const express = require("express");
const http = require("http");
const { Server } = require("socket.io");
const fetch = require("node-fetch");

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
    cors: { origin: "*" }
});

const PORT = process.env.PORT || 3000;
// Menggunakan 127.0.0.1 untuk kestabilan koneksi antar-server lokal
const PHP_API_URL = "http://127.0.0.1/php-api/save_score.php";

// BANK SOAL: 15 Pertanyaan Campuran Pengetahuan Umum & IT Tech (True/False)
const QUESTIONS = [
    { question: "Mata uang resmi negara Jepang adalah Yen.", answer: true },
    { question: "HTML (HyperText Markup Language) adalah sebuah bahasa pemrograman.", answer: false }, 
    { question: "Benua terbesar di dunia berdasarkan luas wilayahnya adalah Asia.", answer: true },
    { question: "Linux adalah sistem operasi yang bersifat Open Source (sumber terbuka).", answer: true },
    { question: "Kuala Lumpur adalah ibu kota dari negara Filipina.", answer: false }, 
    { question: "RAM (Random Access Memory) berfungsi sebagai tempat penyimpanan data permanen pada komputer.", answer: false }, 
    { question: "Mamalia terbesar yang masih hidup di bumi saat ini adalah Paus Biru.", answer: true },
    { question: "HTTP adalah singkatan dari Hypertext Transfer Protocol.", answer: true },
    { question: "Patung Liberty yang terletak di New York merupakan hadiah dari negara Prancis.", answer: true },
    { question: "Python adalah bahasa pemrograman yang menggunakan kompiler (compiler) murni, bukan interpreter.", answer: false }, 
    { question: "Negara Indonesia terletak di antara dua samudra, yaitu Samudra Pasifik dan Samudra Hindia.", answer: true },
    { question: "CPU sering disebut sebagai 'Otak' dari sebuah komputer.", answer: true },
    { question: "Matahari berputar mengelilingi Bumi (Geosentris).", answer: false }, 
    { question: "Karakter utama atau simbol resmi dari sistem operasi Android adalah seekor robot berwarna hijau.", answer: true },
    { question: "Albert Einstein adalah ilmuwan yang menemukan lampu pijar untuk pertama kalinya.", answer: false } 
];

const rooms = new Map();
const createRoomCode = () => Math.random().toString(36).substring(2, 8).toUpperCase();

const getRandomQuestions = () => {
    let shuffled = [...QUESTIONS];
    for (let i = shuffled.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
    }
    return shuffled.slice(0, 15); 
};

const sendPlayerQuestion = (socketId, room, player) => {
    if (player.currentQuestion >= room.listSoal.length) {
        player.finished = true;
        const allFinished = room.players.every(p => p.finished);
        if (allFinished) {
            endGame(room.roomCode);
        } else {
            io.to(socketId).emit("WAITING_FOR_OPPONENT_FINISH");
        }
        return;
    }

    player.timer = 8;
    player.questionStartTime = Date.now();

    io.to(socketId).emit("NEW_QUESTION", {
        question: room.listSoal[player.currentQuestion].question,
        timer: player.timer
    });
};

const startRoomTimerLoop = (roomCode) => {
    const room = rooms.get(roomCode);
    if (!room) return;

    room.interval = setInterval(() => {
        let statusChanged = false;

        room.players.forEach(player => {
            if (player.finished) return;

            player.timer--;
            io.to(player.id).emit("TIMER_UPDATE", player.timer);

            if (player.timer <= 0) {
                player.streak = 0;
                if (!player.allResponses) player.allResponses = [];
                player.allResponses.push(8000); 
                player.wrongCount++;

                player.currentQuestion++;
                sendPlayerQuestion(player.id, room, player);
                statusChanged = true;
            }
        });

        if (statusChanged) {
            io.to(roomCode).emit("UPDATE_SCORE", room.players);
        }
    }, 1000);
};

const endGame = async (roomCode) => {
    const room = rooms.get(roomCode);
    if (!room) return;

    if (room.interval) clearInterval(room.interval);

    const playersSorted = [...room.players].sort((a, b) => b.score - a.score);
    const winner = playersSorted[0];

    room.players.forEach(player => {
        const totalTime = player.allResponses ? player.allResponses.reduce((a, b) => a + b, 0) : 0;
        const avgResponseTime = player.allResponses && player.allResponses.length > 0 
            ? Math.round(totalTime / player.allResponses.length) 
            : 8000;

        const totalSoal = room.listSoal.length;
        const accuracy = Math.round((player.correctCount / totalSoal) * 100);

        io.to(player.id).emit("GAME_OVER", {
            winner: winner ? winner.name : "No one",
            roomPlayers: room.players, 
            isSingleplayer: room.isSingleplayer || false,
            personalStats: {
                avgSpeed: avgResponseTime,
                accuracy: accuracy,
                score: player.score
            }
        });
    });

    console.log(`[SERVER] Mengirim data hasil match room ${roomCode} ke database PHP...`);

    // Backup data player sebelum room dihancurkan biar proses PHP aman di background
    const playersDataBackup = [...room.players];
    
    // LANGSUNG HAPUS ROOM dari memori biar pas klik Play Again langsung dapet soal acak baru
    rooms.delete(roomCode);

    try {
        const requests = playersDataBackup.map(player => {
            const totalTime = player.allResponses ? player.allResponses.reduce((a, b) => a + b, 0) : 0;
            const avgResponseTime = player.allResponses && player.allResponses.length > 0 
                ? Math.round(totalTime / player.allResponses.length) 
                : 8000;

            return fetch(PHP_API_URL, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ 
                    player_name: player.name, 
                    score: player.score,
                    response_time: avgResponseTime,
                    correct_count: player.correctCount,
                    wrong_count: player.wrongCount,
                })
            })
            .then(() => console.log(`[SERVER] Data ${player.name} sukses terkirim.`))
            .catch(err => console.error(`[SERVER] Gagal menembak PHP:`, err.message));
        });
        await Promise.all(requests);
    } catch (e) {
        console.log("Error saat kirim data ke PHP:", e.message);
    }
};

io.on("connection", (socket) => {
    console.log(`User connected: ${socket.id}`);

    socket.on("START_SINGLEPLAYER", (playerName) => {
        const roomCode = "SOLO-" + createRoomCode();
        const newRoom = {
            roomCode: roomCode,
            isSingleplayer: true,
            players: [{ 
                id: socket.id, 
                name: playerName, 
                score: 0, 
                streak: 0, 
                correctCount: 0,
                wrongCount: 0,
                allResponses: [],
                currentQuestion: 0,
                timer: 8,
                finished: false
            }],
            listSoal: getRandomQuestions(), // Manggil fungsi acak pas room dibuat
            questionFirstAnswerer: new Map(), 
            interval: null
        };
        rooms.set(roomCode, newRoom);
        socket.join(roomCode);
        
        socket.emit("ROOM_CREATED", roomCode);
        socket.emit("PLAYER_JOINED", newRoom.players);
        socket.emit("UPDATE_SCORE", newRoom.players);

        sendPlayerQuestion(socket.id, newRoom, newRoom.players[0]);
        startRoomTimerLoop(roomCode);
    });

    socket.on("CREATE_ROOM", (playerName) => {
        const roomCode = createRoomCode();
        rooms.set(roomCode, {
            roomCode: roomCode,
            isSingleplayer: false,
            players: [{ 
                id: socket.id, 
                name: playerName, 
                score: 0, 
                streak: 0, 
                correctCount: 0,
                wrongCount: 0,
                allResponses: [],
                currentQuestion: 0,
                timer: 8,
                finished: false
            }],
            listSoal: getRandomQuestions(), // Manggil fungsi acak pas room dibuat
            questionFirstAnswerer: new Map(), 
            interval: null
        });
        socket.join(roomCode);
        socket.emit("ROOM_CREATED", roomCode);
    });

    socket.on("JOIN_ROOM", ({ roomCode, playerName }) => {
        const room = rooms.get(roomCode);
        if (!room) return socket.emit("ERROR_MESSAGE", "Room tidak ditemukan");
        if (room.isSingleplayer) return socket.emit("ERROR_MESSAGE", "Room tersebut adalah room Singleplayer!");
        if (room.players.length >= 2) return socket.emit("ERROR_MESSAGE", "Room penuh");

        room.players.push({ 
            id: socket.id, 
            name: playerName, 
            score: 0, 
            streak: 0, 
            correctCount: 0,
            wrongCount: 0,
            allResponses: [],
            currentQuestion: 0,
            timer: 8,
            finished: false
        });
        socket.join(roomCode);

        io.to(roomCode).emit("PLAYER_JOINED", room.players);
        io.to(roomCode).emit("UPDATE_SCORE", room.players);

        room.players.forEach(p => {
            sendPlayerQuestion(p.id, room, p);
        });

        startRoomTimerLoop(roomCode);
    });

    socket.on("ANSWER", ({ roomCode, answer }) => {
        const room = rooms.get(roomCode);
        if (!room) return;

        const player = room.players.find(p => p.id === socket.id);
        if (!player || player.finished) return;

        const qIdx = player.currentQuestion;
        const currentQ = room.listSoal[qIdx];
        if (!currentQ) return;

        const exactResponseTime = Date.now() - player.questionStartTime;
        if (!player.allResponses) player.allResponses = [];
        player.allResponses.push(exactResponseTime);

        const firstAnswererId = room.questionFirstAnswerer.get(qIdx);
        let isFirst = false;

        if (!firstAnswererId) {
            room.questionFirstAnswerer.set(qIdx, socket.id);
            isFirst = true;
        }

        if (answer === currentQ.answer) {
            let points = 100;
            if (isFirst) {
                if (player.timer >= 6) points += 50;
                else if (player.timer >= 4) points += 30;
                else if (player.timer >= 2) points += 10;
            }
            player.streak++;
            points += player.streak >= 3 ? 40 : (player.streak >= 2 ? 20 : 0);
            player.score += points;
            player.correctCount++; 
        } else {
            player.streak = 0;
            player.score = Math.max(0, player.score - 30); 
            player.wrongCount++; 
        }

        io.to(roomCode).emit("UPDATE_SCORE", room.players);

        player.currentQuestion++;
        sendPlayerQuestion(socket.id, room, player);
    });

    socket.on("disconnect", () => {
        const roomToClean = [];
        rooms.forEach((room, roomCode) => {
            if (room.players.some(p => p.id === socket.id)) {
                roomToClean.push(roomCode);
            }
        });
        roomToClean.forEach(rc => {
            const room = rooms.get(rc);
            if(room && room.interval) clearInterval(room.interval);
            rooms.delete(rc);
        });
        console.log(`User disconnected: ${socket.id}`);
    });
});

server.listen(PORT, () => console.log(`Server running on port ${PORT}`));
<?php
header("Access-Control-Allow-Origin: *");
header("Content-Type: application/json; charset=UTF-8");
header("Access-Control-Allow-Methods: POST");
header("Access-Control-Allow-Headers: Content-Type");

$conn = new mysqli("localhost", "root", "", "game_tof");

if ($conn->connect_error) {
    die(json_encode(["error" => "Koneksi Gagal"]));
}

$data = json_decode(file_get_contents("php://input"));

if (!empty($data->player_name)) {
    $username = $conn->real_escape_string($data->player_name);

    // 1. Amankan pendaftaran user baru (Gak akan duplikat gara-gata INSERT IGNORE)
    $conn->query("INSERT IGNORE INTO User (Username) VALUES ('$username')");
    $resUser = $conn->query("SELECT UserID FROM User WHERE Username='$username'");
    $user = $resUser->fetch_object();
    $userId = $user->UserID;

    // 2. Ambil data payload asli dari Node.js
    $score        = isset($data->score) ? (int)$data->score : 0;
    $responseTime = isset($data->response_time) ? (int)$data->response_time : 8000;
    $correctCount = isset($data->correct_count) ? (int)$data->correct_count : 0;
    $wrongCount   = isset($data->wrong_count) ? (int)$data->wrong_count : 0;

    // Distribusikan poin rata-rata ke database per soal yang benar
    $pointsPerCorrect = $correctCount > 0 ? round($score / $correctCount) : 0;

    // 3. Masukkan data jawaban BENAR per item soal
    for ($i = 0; $i < $correctCount; $i++) {
        $conn->query("INSERT INTO Response (UserID, Answer_given, Is_correct, Response_time_ms, Points_earned) 
                      VALUES ($userId, 1, 1, $responseTime, $pointsPerCorrect)");
    }

    // 4. Masukkan data jawaban SALAH per item soal
    for ($j = 0; $j < $wrongCount; $j++) {
        $conn->query("INSERT INTO Response (UserID, Answer_given, Is_correct, Response_time_ms, Points_earned) 
                      VALUES ($userId, 1, 0, $responseTime, 0)");
    }

    echo json_encode([
        "status" => "success", 
        "message" => "Match berhasil dicatat penuh untuk user $username"
    ]);
} else {
    echo json_encode(["status" => "error", "message" => "Data payload tidak lengkap"]);
}

$conn->close();
?>
<?php
header("Access-Control-Allow-Origin: *");
header("Content-Type: application/json; charset=UTF-8");

// Nyalain eror log buat tracking kalau ada kendala database
mysqli_report(MYSQLI_REPORT_ERROR | MYSQLI_REPORT_STRICT);
error_reporting(E_ALL);
ini_set('display_errors', 1);

try {
    $conn = new mysqli("localhost", "root", "", "game_tof");

    // QUERY BARU: Jauh lebih simpel, aman dari Strict Mode, dan mengambil skor tertinggi per user
    $leaderboardSql = "SELECT u.Username, 
                              IFNULL(MAX(r.Points_earned * 15), 0) as TotalScore, 
                              IFNULL(AVG(r.Response_time_ms), 0) as PlayerAvgSpeed
                       FROM User u
                       LEFT JOIN Response r ON u.UserID = r.UserID
                       GROUP BY u.UserID, u.Username
                       ORDER BY TotalScore DESC";

    $resLeaderboard = $conn->query($leaderboardSql);

    $leaderboard_clean = [];
    if ($resLeaderboard) {
        while ($row = $resLeaderboard->fetch_assoc()) {
            $leaderboard_clean[] = [
                "Username" => $row['Username'],
                "player_name" => $row['Username'],
                "TotalScore" => (int)$row['TotalScore'],
                "score" => (int)$row['TotalScore'],
                "AvgResponseTime" => round($row['PlayerAvgSpeed'], 2),
                "response_time" => round($row['PlayerAvgSpeed'], 2)
            ];
        }
    }

    // 2. Ambil data statistik global seluruh server game
    $statsSql = "SELECT 
                    AVG(Response_time_ms) as AvgResponseTime,
                    (SUM(CASE WHEN Is_correct = 1 THEN 1 ELSE 0 END) / COUNT(*)) * 100 as AccuracyRate
                FROM Response";
    $resStats = $conn->query($statsSql);
    $stats = ($resStats) ? $resStats->fetch_assoc() : null;

    $avg_speed = ($stats && $stats['AvgResponseTime']) ? round($stats['AvgResponseTime'], 2) : 0;
    $accuracy = ($stats && $stats['AccuracyRate']) ? round($stats['AccuracyRate'], 2) : 0;

    echo json_encode([
        "leaderboard" => $leaderboard_clean,
        "global_stats" => [
            "avg_speed_ms" => $avg_speed,
            "accuracy_percent" => $accuracy
        ]
    ]);

    $conn->close();

} catch (Exception $e) {
    // Jika SQL eror, dia gak bakal ngerusak front-end tapi ngasih tau letak salahnya
    echo json_encode([
        "error" => $e->getMessage(),
        "leaderboard" => [],
        "global_stats" => ["avg_speed_ms" => 0, "accuracy_percent" => 0]
    ]);
}
?>
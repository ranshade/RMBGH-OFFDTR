<?php

namespace App\Mail;

use App\Models\AttendancePhoto;
use Carbon\CarbonInterface;
use Illuminate\Bus\Queueable;
use Illuminate\Contracts\Queue\ShouldQueue;
use Illuminate\Mail\Mailable;
use Illuminate\Mail\Mailables\Content;
use Illuminate\Mail\Mailables\Envelope;
use Illuminate\Queue\SerializesModels;

class AttendanceRecorded extends Mailable implements ShouldQueue
{
    use Queueable, SerializesModels;

    private const PHOTO_WIDTH = 480;

    public function __construct(
        public string $fullName,
        public string $employeeNo,
        public string $eventType,
        public CarbonInterface $recordedAt,
        public ?string $stationCode = null,
        public ?int $attendanceLogId = null,
    ) {
    }

    public function envelope(): Envelope
    {
        $when = $this->localTime()->format('M j, Y g:i A');

        return new Envelope(subject: "{$this->eventLabel()} recorded - {$when}");
    }

    public function content(): Content
    {
        $time = $this->localTime();
        $photo = $this->loadPhoto();

        return new Content(
            view: 'emails.attendance-recorded',
            text: 'emails.attendance-recorded-text',
            with: [
                'appName' => config('app.name'),
                'eventLabel' => $this->eventLabel(),
                'accent' => $this->isTimeIn() ? '#15803d' : '#b45309',
                'dateLabel' => $time->format('l, F j, Y'),
                'timeLabel' => $time->format('h:i:s A'),
                'photoData' => $photo['data'] ?? null,
                'photoMime' => $photo['mime'] ?? null,
            ],
        );
    }

    private function loadPhoto(): ?array
    {
        if (!$this->attendanceLogId) {
            return null;
        }

        $photo = AttendancePhoto::where('attendance_log_id', $this->attendanceLogId)->first();
        $data = $photo?->data;
        if (is_resource($data)) {
            $data = stream_get_contents($data);
        }
        if (!is_string($data) || $data === '') {
            return null;
        }

        if (!function_exists('imagecreatefromstring')) {
            return ['data' => $data, 'mime' => $photo->mime_type];
        }

        $source = @imagecreatefromstring($data);
        if ($source === false) {
            return null;
        }

        $width = imagesx($source);
        $height = imagesy($source);
        $targetWidth = min(self::PHOTO_WIDTH, $width);
        $targetHeight = max(1, (int) round($height * $targetWidth / $width));

        $resized = imagecreatetruecolor($targetWidth, $targetHeight);
        imagecopyresampled($resized, $source, 0, 0, 0, 0, $targetWidth, $targetHeight, $width, $height);

        ob_start();
        imagejpeg($resized, null, 80);
        $jpeg = (string) ob_get_clean();
        imagedestroy($source);
        imagedestroy($resized);

        return $jpeg === '' ? null : ['data' => $jpeg, 'mime' => 'image/jpeg'];
    }

    private function localTime(): CarbonInterface
    {
        return $this->recordedAt->copy()->timezone(config('app.timezone'));
    }

    private function isTimeIn(): bool
    {
        return strtoupper(trim($this->eventType)) === 'TIME IN';
    }

    private function eventLabel(): string
    {
        return $this->isTimeIn() ? 'Time In' : 'Time Out';
    }
}

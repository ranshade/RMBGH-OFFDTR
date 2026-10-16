<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>{{ $eventLabel }} recorded</title>
</head>
<body style="margin:0;padding:0;background:#f3f4f6;font-family:Arial,Helvetica,sans-serif;color:#111827;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f3f4f6;padding:24px 12px;">
        <tr>
            <td align="center">
                <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:480px;background:#ffffff;border-radius:8px;overflow:hidden;">
                    <tr>
                        <td style="background:{{ $accent }};padding:16px 24px;color:#ffffff;font-size:13px;letter-spacing:1px;text-transform:uppercase;">
                            {{ $appName }}
                        </td>
                    </tr>
                    <tr>
                        <td style="padding:24px;">
                            <p style="margin:0 0 4px;font-size:14px;color:#6b7280;">Hello {{ $fullName }},</p>
                            <h1 style="margin:0 0 20px;font-size:24px;color:{{ $accent }};">{{ $eventLabel }} recorded</h1>

                            @if ($photoData && isset($message))
                            <p style="margin:0 0 20px;"><img src="{{ $message->embedData($photoData, 'punch-photo.jpg', $photoMime) }}" alt="Your {{ $eventLabel }} photo" width="320" style="display:block;width:100%;max-width:320px;height:auto;border-radius:6px;"></p>
                            @endif

                            <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-top:1px solid #e5e7eb;">
                                <tr>
                                    <td style="padding:10px 0;font-size:13px;color:#6b7280;border-bottom:1px solid #e5e7eb;">Date</td>
                                    <td align="right" style="padding:10px 0;font-size:14px;font-weight:bold;border-bottom:1px solid #e5e7eb;">{{ $dateLabel }}</td>
                                </tr>
                                <tr>
                                    <td style="padding:10px 0;font-size:13px;color:#6b7280;border-bottom:1px solid #e5e7eb;">Time</td>
                                    <td align="right" style="padding:10px 0;font-size:14px;font-weight:bold;border-bottom:1px solid #e5e7eb;">{{ $timeLabel }}</td>
                                </tr>
                                <tr>
                                    <td style="padding:10px 0;font-size:13px;color:#6b7280;border-bottom:1px solid #e5e7eb;">Employee ID</td>
                                    <td align="right" style="padding:10px 0;font-size:14px;border-bottom:1px solid #e5e7eb;">{{ $employeeNo }}</td>
                                </tr>
                            </table>

                            <p style="margin:20px 0 0;font-size:12px;line-height:1.5;color:#6b7280;">
                                If you did not make this punch, please report it to the HR Department.
                                This is an automated message, please do not reply.
                            </p>
                        </td>
                    </tr>
                </table>
            </td>
        </tr>
    </table>
</body>
</html>

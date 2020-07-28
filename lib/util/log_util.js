const { createLogger, format, transports } = require('winston');
const { combine, timestamp, label, printf } = format;
const DailyRotateFile = require('winston-daily-rotate-file');

const myFormat = printf(({ level, message, label, timestamp, durationMs }) => {
    if (durationMs) {
        return ` ${timestamp} [${label}] ${level}: duration=${durationMs}, ${message}`;
   } else {
        return `${timestamp} [${label}] ${level}: ${message}`;
    }

});

module.exports = function (file_name, dir_name, labelStr) {
    return createLogger({
        format: combine(
            label({ label: labelStr }),
            timestamp(),
            myFormat
        ),
        transports: [
            new DailyRotateFile({
                level: 'info',
                filename: `${file_name}-%DATE%.log` || 'logger-%DATE%.log',
                dirname: dir_name || null,
                handleExceptions: true,
                datePattern: 'YYYY-MM-DD',
                json: true,
                zippedArchive: true,
                maxSize: '100m',
                maxFiles: '30d',
                eol: "\n\r",
                colorize: false
            }),

            new transports.Console({
                level: 'debug',
                handleExceptions: true,
                json: true,
                colorize: true
            })
        ]
    });
};
const { createLogger, format, transports } = require('winston');
const { combine, timestamp, label, printf } = format;
const DailyRotateFile = require('winston-daily-rotate-file');
let morgan = require('morgan');
let rfs = require('rotating-file-stream');
let config = require("../../config.json");
const myFormat = printf(({ level, message, label, timestamp, durationMs }) => {
    if (durationMs) {
        return ` ${timestamp} [${label}] ${level}: duration=${durationMs}, ${message}`;
   } else {
        return `${timestamp} [${label}] ${level}: ${message}`;
    }

});

const fomatErrorLog = function (e){
    if (e) {
        this.error(`\r\n ***************** Error ***************** 
                          \nBaseURL: ${e.config && e.config.baseURL? e.config.baseURL : ""}
                          \nURL: ${e.config && e.config.url ? e.config.url : ""}
                          \nRequest: ${e.config && e.config.data ? e.config.data: ""}
                          \nMethod: ${e.config && e.config.method ? e.config.method : ""}
                          \nAuth: ${e.config && e.config.auth ? JSON.stringify(e.config.auth) : ""}
                          \nStatus: ${e.response && e.response.status? e.response.status : -1}
                          \nstatusText: ${e.response && e.response.statusText ? e.response.statusText : ""}
                          \nerrorMessage: ${e.response && e.response.data && e.response.data.errorMessage? e.response.data.errorMessage : ""}
                          \nerrors: ${e.response && e.response.data && e.response.data.errors? JSON.stringify(e.response.data.errors) : ""}
                          \nStack: ${e.stack}
                          \n***************** Error *****************
               `);
    }
};

module.exports = {
    getLogger: function(labelStr) {
        let logger = createLogger({
            format: combine(
                label({ label: labelStr }),
                timestamp(),
                myFormat
            ),
            transports: [
                new DailyRotateFile({
                    level: 'info',
                    filename: `${config.logger_file}-%DATE%.log` || 'logger-%DATE%.log',
                    dirname: config.logger_path || null,
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
        logger['fomatErrorLog'] = fomatErrorLog;
        return logger;
    },

    initAccessLog: function (app) {
        morgan.token('id', function getId(req) {
            return req.id
        })
        // access log
        let accessLogStream = rfs.createStream('access.log', {
            interval: '1d', // rotate daily
            path: config.logger_path
        });
        app.use(morgan(':id [:date[clf]] :status :response-time ms ":method :res[content-length] :url HTTP/:http-version" :remote-addr - :remote-user ":referrer" ":user-agent"', { stream: accessLogStream }));

    }
};
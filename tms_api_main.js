let config = require("./config.json");

let fs = require('fs');
let _ = require("lodash");
let moment = require('moment');
let express = require('express');
let uuid = require('node-uuid');
let morgan = require('morgan');
let rfs = require('rotating-file-stream');

let TmsRouter = require('./lib/route/TmsRouter');
let mysqlUtil = require("./lib/util/MysqlUtil");
let log_util = require('./lib/util/log_util');
let auth_service = require('./lib/service/auth/auth_service');

const P44_API_NAME = 'Project44';
let options = {
    config: null,
    mysql: null,
    log: null,
    _: _,
    moment: moment,
};
let app = express();

async function beforeStartServer(){
    Object.assign(options, {mysql: initMysql()}); // generate mysql instance
    Object.assign(options, {log: initServerLog()}); // generate server log instance
    await initP44Config();
    Object.assign(options, {config: config});
}
function initMysql(){
    let logger = log_util(config.logger_file, config.logger_path, "mysql");
    let mysql = new mysqlUtil({
        host: config.db_host_tms,
        port: config.db_port_tms,
        user: config.db_user_tms,
        password: config.db_password_tms,
        database: config.db_database_tms
    }, logger);
    return mysql;
}

function initServerLog(){
    let logger = log_util(config.logger_file, config.logger_path, "api");
    return logger;
}

async function initP44Config(){
    let p44HostInfo = await getP44HostInfo();
    if (p44HostInfo) {
        Object.assign(config, p44HostInfo);
    }
}



function startServer(){
    let https_options = {
        key: fs.readFileSync("freightapp_key.pem"),
        cert: fs.readFileSync("freightapp_cert.pem")
    };
    let serverPort = options.config.tms_api_port;

    app.use(assignId);
    morgan.token('id', function getId(req) {
        return req.id
    })
// access log
    let accessLogStream = rfs.createStream('access.log', {
        interval: '1d', // rotate daily
        path: config.logger_path
    });
    app.use(morgan(':id [:date[clf]] :status :response-time ms ":method :res[content-length] :url HTTP/:http-version" :remote-addr - :remote-user ":referrer" ":user-agent"', { stream: accessLogStream }));
// auth
    app.use(auth_service(options.mysql));

    let router = express.Router();
    let tmsRouter = new TmsRouter(options);
    app.use("/tmsapi", tmsRouter.router(router));
    app.use(handleError(options.log));
    let server = require("https").createServer(https_options,app);
    server.listen(serverPort);
}

function assignId(req, res, next) {
    req.id = uuid.v4();
    next()
}

function log(logger, e){
    if (logger && e) {
        logger.error(`\r\n ***************** Error ***************** 
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

function handleError(logger) {
    return function (err, req, res, next) {
        log(logger, err);
        let rst =Object.assign({},{'reference_id':req.id},
                                  {"error":err,
                                   "stack": (err.response && err.response.data) || err.stack || err.message
                                  }
                              );
        res.status(err.status || 500);
        res.json(rst);
    }
}

function afterStartServer(){
    options.log.info("server started");
    process.on('unhandledRejection', error => {
        options.log.error(error);
});
}


async function getP44HostInfo(){
    let sql = ` select api_manager.api_manager_url, api_manager_lines.api_manager_lines_key, api_manager_lines.api_manager_lines_value  from api_manager
                inner join api_manager_lines on fk_api_manager_id = api_manager_id 
                where api_manager_name ='${P44_API_NAME}' and api_manager_type='Outbound' limit 2; `;
    let raws = await options.mysql.query(sql);
    if (!raws || raws.length != 2) {
        return null;
    } else {
        let userName,password, hostUrl;
        for(let _item of raws) {
            if (_item['api_manager_url']) {
                hostUrl = _item['api_manager_url'];
            }
            if (_item['api_manager_lines_key'] && _item['api_manager_lines_key'] == 'username') {
                userName = _item['api_manager_lines_value']
            }
            if (_item['api_manager_lines_key'] && _item['api_manager_lines_key'] == 'password') {
                password = _item['api_manager_lines_value']
            }
        }
        return {
            "project_44_host":hostUrl,
            "project_44_user_name":userName,
            "project_44_password":password
        }
    }
}

async function start(){
    await beforeStartServer();
    startServer();
    afterStartServer();
};
start();





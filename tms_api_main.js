let config = require("./config.json");
let fs = require('fs');
let _ = require("lodash");
let moment = require('moment');
let express = require('express');
let morgan = require('morgan');
let rfs = require('rotating-file-stream');
let TmsRouter = require('./lib/route/TmsRouter');
let uuid = require('node-uuid');
let mysqlUtil = require("./lib/util/MysqlUtil");
let log_util = require('./lib/util/log_util');
let auth_service = require('./lib/service/auth/auth_service');
let logger = log_util(config.logger_file, config.logger_path, "api");
const P44_API_NAME = 'Project44';
let accessLogStream = rfs.createStream('access.log', {
    interval: '1d', // rotate daily
    path: config.logger_path
});

let mysql = new mysqlUtil({
    host: config.db_host_tms,
    port: config.db_port_tms,
    user: config.db_user_tms,
    password: config.db_password_tms,
    database: config.db_database_tms
}, logger);

let options = {
    key: fs.readFileSync("freightapp_key.pem"),
    cert: fs.readFileSync("freightapp_cert.pem")
};


startServer();

async function startServer(){
    await initConfig(config);
    let serverPort = config.tms_api_port;
    let app = express();
    morgan.token('id', function getId(req) {
        return req.id
    })
// access log
    app.use(morgan(':id [:date[clf]] :status :response-time ms ":method :res[content-length] :url HTTP/:http-version" :remote-addr - :remote-user ":referrer" ":user-agent"', { stream: accessLogStream }));
    app.use(assignId);

// auth
    app.use(auth_service(mysql, logger));

    let router = express.Router();
    let tmsRouter = new TmsRouter(config, logger, mysql, _, moment);
    app.use("/tmsapi", tmsRouter.router(router));
    app.use(handleError(logger));
    let server = require("https").createServer(options,app);
    server.listen(serverPort);
    logger.info("server started");
    process.on('unhandledRejection', error => {
        logger.error(error);
  });
}

async function initConfig(){
    let p44HostInfo = await getP44HostInfo();
    if (p44HostInfo) {
        Object.assign(config, p44HostInfo);
    }
}


async function getP44HostInfo(){
    let sql = ` select api_manager.api_manager_url, api_manager_lines.api_manager_lines_key, api_manager_lines.api_manager_lines_value  from api_manager
                inner join api_manager_lines on fk_api_manager_id = api_manager_id 
                where api_manager_name ='${P44_API_NAME}' and api_manager_type='Outbound' limit 2; `;
    let raws = await mysql.query(sql);
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


function assignId(req, res, next) {
    req.id = uuid.v4();
    next()
}

function handleError(logger) {
    return function (err, req, res, next) {
        logger.error(err.stack || err.message);
        let rst =Object.assign({},{'reference_id':req.id},
                                  {"error":err,
                                   "stack": (err.response && err.response.data) || err.stack || err.message
                                  }
                              );
        res.status(err.status || 500);
        res.json(rst);
    }
}



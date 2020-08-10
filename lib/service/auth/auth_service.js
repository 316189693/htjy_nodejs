module.exports = function (mysql) {
    return async function authHandle(req, res, next) {
        let authorization = req.get('authorization');
        if (authorization) {
            let auths = (authorization + "").split(" ");
            if (auths && auths.length == 2) {
                authorization = auths[1];
            }
        } else {
            authorization = req.query.token;
        }
        let has_access = false;
        if (authorization) {
                let crypt = Buffer.from(authorization, 'base64').toString('utf8');
                if (crypt) {
                    let [username, password] = crypt.split(":");
                    if (username && password) {
                        username = mysql.escapeStr(username);
                        password = mysql.escapeStr(password);
                        let sql = `
                select count(*) as num from api_manager
                inner join api_manager_lines on fk_api_manager_id = api_manager_id 
                where api_manager_name ='TMSApi' and api_manager_lines_custom_key =${username}and api_manager_lines_value =${password}
                `;
                        let raw = await mysql.assocQuery(sql);
                        if (parseInt(raw['num']) > 0) {
                            has_access = true;
                        }
                    }
                }
        } else if (['/favicon.ico'].indexOf(req.url) != -1) {
            has_access = true;
        }

        if (!has_access) {
           
            next({ 'status': 401, 'message': 'Auth Fail' });
        } else {
            next()
        }
    }
}
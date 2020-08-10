
let P44Service = require("../service/p44/P44Service");
let ApiTransferService = require("../service/api_transfer/APITransferService");
let ApiType = require("../config/ApiType");
let ApiName = require("../config/ApiName");
let commonUtil = require("../util/common_util.js");
let emailUtil = require("../util/email_util");

class TmsRouter {
    constructor(options) {
        this.options = options;
        this.mysql = this.options.mysql;
        this.logger = this.options.log;
        this.config = this.options.config;
        this._ = this.options._;
        this.moment = this.options.moment;
        this.routers = [];
        this.initRoute();
    }

    initRoute() {
        let logger = this.logger;
        let mysql = this.mysql;
        let p44Service = new P44Service(this.mysql, this.config, this.logger, this._, commonUtil, this.moment);
        let apiTransferService = new ApiTransferService(this.mysql, this.config, this.logger, this._, commonUtil, this.moment);

        this.routers = [
            {
                'url': '/cron/transfer/lines/submit',
                'method': 'get',
                'func': this.controller(this.validateCompanyIds, async function (req) {
                    let limit_num =req.query.limit || 500;
                    let num =  await apiTransferService.transfer(req.query.companyIds, limit_num);
                    let rst = { 'status': 200, 'data': { 'num':num } };
                    return rst;
                })
            },

            {
                'url': '/cron/transfer/:lineId',
                'method': 'get',
                'func': this.controller(null, async function (req) {
                    let rst = { 'status': 200, 'data': null };
                    let sql = `select * from tms_api_transfer where tms_api_transfer_id =${req.params.lineId} ;`;
                    let raw = await mysql.assocQuery(sql);
                    rst.data = raw;
                    return rst;
                })
            },

            {
                'url': '/cron/transfer/:lineId/submit',
                'method': 'get',
                'func': this.controller(this.validateLineId, async function (req) {
                    let num =  await apiTransferService.rerunTransfer(req.params.lineId)
                    let rst = { 'status': 200, 'data': { 'num':num} };
                    return rst;
                })
            },

            {
                'url': '/cron/p44/create/shipments',
                'method': 'get',
                'func': this.controller(this.validateCompanyIds, async function (req) {
                    let limit_num =req.query.limit || 500;
                    let order_id = req.query.orderId;
                    let start_date = req.query.startDate || '2020-08-30';
                    let rst = await p44Service.fetchShipmentCreatedOrders(req.query.companyIds, limit_num, order_id, start_date);
                    let num = 0;
                    if (rst) {
                        num = rst.length;
                        await p44Service.insertP44LinesToApiTransfer(rst, ApiType.OUT, ApiName.P44_create_shipment);
                    }
                    rst = { 'status': 200, 'data': { 'num': num } };
                    return rst;
                })
            },


            {
                'url': '/cron/p44/tracked/shipments',
                'method': 'get',
                'func': this.controller(this.validateCompanyIds, async function (req) {
                    let limit_num =req.query.limit || 500;
                    let start_date = req.query.startDate || '2020-08-30';
                    let rst = await p44Service.fetchDispatchedOrders(req.query.companyIds, limit_num, start_date);
                    let num = 0;
                    if (rst) {
                        num = rst.length;
                        await p44Service.insertP44LinesToApiTransfer(rst, ApiType.OUT, ApiName.P44_tracked_shipment);
                    }
                    rst = { 'status': 200, 'data': { 'num': num } };
                    return rst;
                })
            },

            {
                'url': '/cron/p44/load/tracking/status',
                'method': 'get',
                'func': this.controller(this.validateCompanyIds, async function (req) {
                    let limit_num =req.query.limit || 500;
                    let order_id = req.query.orderId;
                    let start_date = req.query.startDate || '2020-08-30';
                    let rst = await p44Service.fetchOrdersOfEnabledLoadP44TrackingStatusCarrierByCompanyIds(req.query.companyIds, limit_num, order_id, start_date);
                    let num = 0;
                    if (rst) {
                        num = rst.length;
                        await p44Service.insertP44LinesToApiTransfer(rst, ApiType.IN, ApiName.P44_load);
                    }
                    rst = { 'status': 200, 'data': { 'num': num } };
                    return rst;
                })
            },

            {
                'url': '/cron/p44/push/tracking/status',
                'method': 'get',
                'func': this.controller(this.validateCompanyIds, async function (req) {
                    let limit_num =req.query.limit || 500;
                    let start_date = req.query.startDate || '2020-08-30';
                    let rst = await p44Service.fetchOrdersOfEnabledPushTrackingStatusToP44CarrierByCompanyIds(req.query.companyIds, limit_num, start_date);
                    let num = 0;
                    if (rst) {
                        num = rst.length;
                        await p44Service.insertP44LinesToApiTransfer(rst, ApiType.OUT, ApiName.P44_push);
                    }
                    rst = { 'status': 200, 'data': { 'num': num } };
                    return rst;
                })
            },
        {
            'url': '/delete/transfer',
            'method': 'get',
            'func': this.controller(this.validateCompanyIds, async function (req) {
             await p44Service.deleteTmsApiTransfer(req.query.dateInterval, req.query.companyIds) ();
            rst = { 'status': 200};
            return rst;
        })
        },

            {
                'url': '/test/email',
                'method': 'get',
                'func': this.controller(this.validateCompanyIds, async function (req) {
                    emailUtil.sendMail('will.zheng@unisco.com', 'test', 'this is for test', "<b>Hello world?</b>");
                    rst = { 'status': 200, 'data': { 'num': 1 } };
                    return rst;
                })
            },

        ];
    }

    controller(validateFunc, processFunc) {
        return async function (req, res, next) {
            let validate_str = null;
            if (commonUtil.isFunction(validateFunc)) {
                let validateRst = validateFunc(req);
                if (validateRst.status < 0) {
                    next({ 'status': 400, 'message': validateRst.message });
                    return;
                }
            }
            try {
                let processRst = await processFunc(req);
                res.status(processRst.status || 200);
                res.json(Object.assign({ "reference_id": req.id }, processRst));
            } catch (err) {
                next(err);
            }

        }
    }

    validateCompanyIds(req) {
        let companyIds = req.query.companyIds && JSON.parse(req.query.companyIds) || [23];
        req.query.companyIds = companyIds;
        if (!commonUtil.isArray(companyIds)) {
            return { "status": -1, "message": "companyIds required and must be an Array" };
        }
        return { "status": 1 };
    }

    validateLineId(req) {
        let lineId = req.params.lineId;
        if (!lineId) {
            return { "status": -1, "message": "lineId Invalid, lineId=" + lineId };
        }
        return { "status": 1 };
    }

    router(router) {
        for (let _router of this.routers) {
            router[_router.method](_router.url, _router.func);
        }
        return router;
    }
}

module.exports = TmsRouter;
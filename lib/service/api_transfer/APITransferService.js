let ProcessorFactory = require("./ProcessorFactory");
let ApiStatus = require("../../config/ApiStatus");
class APITransferService {
    constructor(mysql,config, logger, _, commonUtil, moment) {
        this.mysql = mysql;
        this.config = config;
        this._ = _;
        this.logger = logger;
        this.commonUtil = commonUtil;
        this.moment = moment;
    }

    async transfer(companyIds, limit_num) {
        let apiTransfers = await this.getWaittingApiTransferLines(companyIds, limit_num);
        if (!this.commonUtil.isArray(apiTransfers)) {
            return 0;
        }
        await this.updateApiTransferAsRunning(this._.map(apiTransfers, (item) => item.tms_api_transfer_id));
        const promise_num = 50; // at most, 50 promises run at same time
        const groupSize = Math.max(Math.floor(apiTransfers.length / promise_num), 1);
        const groups = this._.chunk(apiTransfers, groupSize);
        let processorFactory = new ProcessorFactory(this.mysql, this.config, this.logger, this._, this.commonUtil, this.moment);

         Promise.all(this._.map(groups, groups => this.runGroups(processorFactory, groups)))
            .catch(err => {
                this.logger.error("transfer has error:" + err);
                if (err.response && err.response.data) {
                    this.logger.error(JSON.stringify(err.response.data));
                }
            });
        return apiTransfers.length;
    }

   async runGroups(processorFactory, ary){
        for (let i = 0; i < ary.length; i++) {
            let processor = processorFactory.createProcessor(ary[i]['api_name']);
            if (processor) {
                await processor.process(ary[i]);
            }
        }
    }

    async rerunTransfer(transferLineId) {
        this.updateApiTransferAsRunning([transferLineId]);
        let sql = `select tms_api_transfer_id,  fk_tms_order_id as tms_order_id, tms_order_pro,
                           fk_company_id as company_id, fk_tms_dispatch_id as dispath_id,
                           tms_api_transfer_internal_status as internal_status,
                           tms_api_transfer_reference as reference,
                           tms_api_transfer_lines_inout as in_out,
                           tms_api_transfer_status as transfer_status,
                           tms_api_transfer_request as request,
                           tms_api_transfer_response as response,
                           tms_api_transfer_external_status as external_status,
                           tms_api_transfer_api_name as api_name,
                           tms_api_transfer_desc as transfer_desc,
                           tms_api_transfer_create_when,
                           DATE_FORMAT(tms_api_transfer_create_when,
                                                '%y-%m-%dT%H:%i:%s') as create_when,
                           DATE_FORMAT(tms_api_transfer_update_when,
                                                '%y-%m-%dT%H:%i:%s') as update_when
                    from tms_api_transfer where 
                     tms_api_transfer_id = ${transferLineId}
                    limit 1;`;
        let raw = await this.mysql.assocQuery(sql);
        if (!raw) {
            return -1;
        }
        let processorFactory = new ProcessorFactory(this.mysql, this.config, this.logger, this._, this.commonUtil, this.moment);
        let processor = processorFactory.createProcessor(raw['api_name']);
        if (processor) {
            await processor.process(raw);
            return 1;
        }else {
            return -1;
        }
    }

    async getWaittingApiTransferLines(companyIds,limit_num) {
        let companyIdStr = companyIds.join();
        let sql = `select tms_api_transfer_id,  fk_tms_order_id as tms_order_id, tms_order_pro,
                           fk_company_id as company_id, fk_tms_dispatch_id as dispath_id,
                           tms_api_transfer_internal_status as internal_status,
                           tms_api_transfer_reference as reference,
                           tms_api_transfer_lines_inout as in_out,
                           tms_api_transfer_status as transfer_status,
                           tms_api_transfer_request as request,
                           tms_api_transfer_response as response,
                           tms_api_transfer_external_status as external_status,
                           tms_api_transfer_api_name as api_name,
                           tms_api_transfer_desc as transfer_desc,
                           tms_api_transfer_create_when,
                           DATE_FORMAT(tms_api_transfer_create_when,
                                                '%y-%m-%dT%H:%i:%s') as create_when,
                           DATE_FORMAT(tms_api_transfer_update_when,
                                                '%y-%m-%dT%H:%i:%s') as update_when
                    from tms_api_transfer where tms_api_transfer_status='${ApiStatus.WAIT}' 
                    and fk_company_id in (${companyIdStr})
                    order by tms_api_transfer_id asc
                    limit ${limit_num};`;
        let raw = await this.mysql.query(sql);
        return raw;
    }
    async updateApiTransferAsRunning(tmsApiTransferIds) {
       if (!this.commonUtil.isArray(tmsApiTransferIds)) {
           return;
       }
        let tmsApiTransferIdsStr = tmsApiTransferIds.join();
        let sql = `update tms_api_transfer set tms_api_transfer_status='${ApiStatus.RUNNING}'
                  where tms_api_transfer_status='${ApiStatus.WAIT}' 
                    and tms_api_transfer_id in (${tmsApiTransferIdsStr})
                    ;`;
        await this.mysql.query(sql);
    }
}

module.exports = APITransferService;
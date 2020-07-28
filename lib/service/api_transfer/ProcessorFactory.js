let ApiName = require("../../config/ApiName.js");
let P44CreateShipmentProcessor = require("../../processor/P44CreateShipmentProcessor.js");
let P44TrackedShipmentProcessor = require("../../processor/P44TrackedShipmentProcessor.js");
let P44LoadProcessor = require("../../processor/P44LoadProcessor.js");
let P44PushProcessor = require("../../processor/P44PushProcessor.js");
class ProcessorFactory {

    constructor(mysql, config, logger, _, commonUtil, moment) {
        this.mysql = mysql;
        this.config = config;
        this.logger = logger;
        this._ = _;
        this.commonUtil = commonUtil;
        this.moment = moment;
        this.processors = {
            [ApiName.P44_create_shipment]: P44CreateShipmentProcessor,
            [ApiName.P44_tracked_shipment]: P44TrackedShipmentProcessor,
            [ApiName.P44_load]: P44LoadProcessor,
            [ApiName.P44_push]: P44PushProcessor
        };
    }

    createProcessor(api_name) {
        if (this.processors[api_name]) {
            return new this.processors[api_name](this.mysql, this.config, this.logger, this._, this.commonUtil, this.moment);
        }
        return null;
    }
}

module.exports = ProcessorFactory;
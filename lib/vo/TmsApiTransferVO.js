class TmsApiTransferVO {
    tms_api_transfer_id;
    fk_tms_order_id;
    tms_order_pro;
    fk_company_id;
    fk_tms_dispatch_id;
    tms_api_transfer_internal_status;
    tms_api_transfer_reference;
    tms_api_transfer_lines_inout;
    tms_api_transfer_status;
    tms_api_transfer_request;
    tms_api_transfer_response;
    tms_api_transfer_external_status;
    tms_api_transfer_api_name;
    tms_api_transfer_desc;
    tms_api_transfer_create_when;
    tms_api_transfer_update_when;
    constructor(){}

}


TmsApiTransferVO.IN = "IN";
TmsApiTransferVO.OUT = "OUT";

TmsApiTransferVO.INTERNAL_STATUS_COMPLETE = "COMPLETE";

module.exports = TmsApiTransferVO;
"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.HEAD_YAW_THRESHOLD = exports.MAR_THRESHOLD = exports.EAR_THRESHOLD = exports.LIVENESS_THRESHOLDS = exports.MAR_INDICES = exports.EAR_LANDMARKS = exports.Challenge = void 0;
var Challenge;
(function (Challenge) {
    Challenge["BLINK"] = "BLINK";
    Challenge["SMILE"] = "SMILE";
    Challenge["HEAD_TURN"] = "HEAD_TURN";
})(Challenge || (exports.Challenge = Challenge = {}));
exports.EAR_LANDMARKS = {
    leftEye: [159, 145],
    rightEye: [386, 374],
};
exports.MAR_INDICES = [61, 291, 13, 14];
exports.LIVENESS_THRESHOLDS = {
    EAR: 0.2,
    MAR: 0.6,
    headYaw: 0.15,
};
// Individual thresholds for direct convenience imports
exports.EAR_THRESHOLD = 0.2;
exports.MAR_THRESHOLD = 0.6;
exports.HEAD_YAW_THRESHOLD = 0.15;

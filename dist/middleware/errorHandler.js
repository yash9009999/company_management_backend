"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.errorHandler = void 0;
const errorHandler = (err, _req, res, _next) => {
    console.error(err);
    const status = err.status || 500;
    const message = err.message || 'Internal server error';
    res.status(status).json({ message });
};
exports.errorHandler = errorHandler;

# OPUS Deployment Guide

OPUS uses a Node.js and Express backend, a React and Vite frontend, and MongoDB through Mongoose. In production, the backend serves the built frontend and exposes the API under `/api`.

## 1. Prerequisites

- Node.js 20.19 or newer
- npm
- MongoDB Community Server for local development
- MongoDB Atlas for cloud deployment
- Optional SMTP credentials for real email delivery
- Git only when source-control deployment is required

## 2. Local development

### Start MongoDB

If MongoDB Community Server is installed, make sure its Windows service is running.

The local connection is:

```text
mongodb://localhost:27017/opus
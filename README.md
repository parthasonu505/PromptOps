# PromptOps Platform

A comprehensive enterprise-grade platform for managing AI prompt lifecycles with role-based access control, version management, approval workflows, and audit trails.

## 🚀 Features

### Core Functionality
- **Prompt Management**: Create, edit, organize, and deploy AI prompts with full lifecycle support
- **Version Control**: Track changes with semantic versioning and detailed changelogs
- **Approval Workflows**: Multi-stage approval process with comments and notifications
- **Role-Based Access**: Four distinct user roles with appropriate permissions
- **Testing Sandbox**: Safe environment for prompt testing before production deployment
- **API & SDK Access**: RESTful API with comprehensive documentation and SDK support
- **Audit Trail**: Complete activity logging for compliance and debugging
- **User Management**: Administrative controls for user accounts and permissions

### User Roles
- **Prompt Engineer**: Create and edit prompts, submit for approval
- **Engineering Lead**: Approve prompts, manage versions, oversee workflows
- **API Developer**: Access API features, manage API keys, integrate with external systems
- **Admin**: Full system access including user management and system configuration

## 🛠 Tech Stack

### Frontend
- **React 18** with TypeScript for type-safe development
- **Vite** for fast development and optimized builds
- **Tailwind CSS** with Shadcn/ui components for consistent design
- **TanStack Query** for efficient server state management
- **React Hook Form** with Zod validation for robust form handling
- **Wouter** for lightweight client-side routing

### Backend
- **Node.js** with Express.js for the REST API
- **TypeScript** for full-stack type safety
- **PostgreSQL** with Neon serverless driver for scalable data storage
- **Drizzle ORM** for type-safe database operations
- **Session-based authentication** with bcrypt for security

## 🏗 Project Structure

```
├── client/                 # React frontend application
│   ├── src/
│   │   ├── components/     # Reusable UI components
│   │   ├── pages/          # Application pages/routes
│   │   ├── hooks/          # Custom React hooks
│   │   ├── lib/            # Utility functions and configurations
│   │   └── App.tsx         # Main application component
├── server/                 # Express backend application
│   ├── db.ts              # Database connection and configuration
│   ├── routes.ts          # API route definitions
│   ├── storage.ts         # Data access layer
│   └── index.ts           # Server entry point
├── shared/                 # Shared types and schemas
│   └── schema.ts          # Database schema and type definitions
└── README.md              # This file
```

## 🚀 Getting Started

### Prerequisites
- Node.js 18+ 
- PostgreSQL database (Neon recommended for production)
- npm or yarn package manager

### Installation

1. **Clone the repository**
   ```bash
   git clone <repository-url>
   cd promptops-platform
   ```

2. **Install dependencies**
   ```bash
   npm install
   ```

3. **Set up environment variables**
   Create a `.env` file in the root directory:
   ```env
   DATABASE_URL=your_postgresql_connection_string
   SESSION_SECRET=your_secure_session_secret
   NODE_ENV=development
   ```

4. **Initialize the database**
   ```bash
   npm run db:push
   ```

5. **Start the development server**
   ```bash
   npm run dev
   ```

The application will be available at `http://localhost:5000`

### Demo Accounts

For testing purposes, the following demo accounts are available:

| Username | Password | Role |
|----------|----------|------|
| admin | admin123 | Admin |
| engineer | engineer123 | Prompt Engineer |
| lead | lead123 | Engineering Lead |
| developer | dev123 | API Developer |

## 📚 Usage Guide

### Creating Prompts
1. Log in with a Prompt Engineer or Admin account
2. Navigate to Dashboard
3. Click "Create New Prompt"
4. Fill in prompt details: name, description, content, category
5. Set environment (development/staging/production)
6. Choose access level (private/team/organization)
7. Submit for creation or approval workflow

### Managing Versions
- All prompt changes automatically create new versions
- Version numbers follow semantic versioning (e.g., 1.0.0, 1.1.0, 2.0.0)
- Each version includes a detailed changelog
- Previous versions can be restored if needed

### Approval Workflow
1. Prompt Engineers submit prompts for approval
2. Engineering Leads receive approval requests
3. Reviewers can approve, reject, or request changes
4. Comments and feedback are tracked throughout the process
5. Approved prompts become available for production use

### API Access
- Generate API keys from the API & SDK page
- Use keys to authenticate API requests
- Access prompt data programmatically
- Monitor usage and performance metrics

### Testing Prompts
- Use the Testing Sandbox for safe prompt testing
- Test with variables and different inputs
- Review test results and performance metrics
- Validate prompts before production deployment

## 🔧 API Reference

### Authentication
All API requests require authentication using API keys:
```bash
Authorization: Bearer your_api_key_here
```

### Core Endpoints

#### Prompts
- `GET /api/prompts` - List all prompts with filtering
- `POST /api/prompts` - Create a new prompt
- `GET /api/prompts/:id` - Get specific prompt details
- `PUT /api/prompts/:id` - Update prompt
- `DELETE /api/prompts/:id` - Delete prompt

#### Versions
- `GET /api/prompts/:id/versions` - Get prompt version history
- `POST /api/prompts/:id/versions` - Create new version
- `GET /api/versions/:id` - Get specific version details

#### Approvals
- `GET /api/approvals` - List approval requests
- `POST /api/approvals` - Create approval request
- `PUT /api/approvals/:id` - Update approval status

## 🎯 Key Features in Detail

### Version Control System
- **Semantic Versioning**: Automatic version numbering
- **Change Tracking**: Detailed changelog for each version
- **Rollback Capability**: Restore previous versions
- **Branch Support**: Development, staging, production environments

### Security & Compliance
- **Role-Based Access Control**: Fine-grained permissions
- **Session Management**: Secure authentication
- **Audit Logging**: Complete activity tracking
- **API Key Management**: Secure external access

### User Experience
- **Responsive Design**: Works on desktop and mobile
- **Dark/Light Theme**: User preference support
- **Real-time Updates**: Live data synchronization
- **Intuitive Interface**: Clean, professional design

## 🧪 Testing

The platform includes comprehensive test data for all features:
- Sample prompts across different categories
- Version history with realistic changes
- Approval workflows in various states
- User accounts with different roles
- API keys with different permissions
- Audit trail with activity history

## 🚀 Deployment

### Development
```bash
npm run dev
```

### Production Build
```bash
npm run build
npm start
```

### Database Management
```bash
# Push schema changes
npm run db:push

# Generate migrations (if needed)
npm run db:generate

# View database studio
npm run db:studio
```

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Add tests if applicable
5. Submit a pull request

## 📄 License

This project is licensed under the MIT License - see the LICENSE file for details.

## 🆘 Support

For support and questions:
- Create an issue in the repository
- Check the documentation
- Review the API reference
- Test with demo accounts

## 🔄 Recent Updates

- **July 2, 2025**: Comprehensive platform testing and bug fixes completed
- **July 1, 2025**: Initial platform development and core features implemented

---

**Built with ❤️ for enterprise prompt management**
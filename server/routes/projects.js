/**
 * Projects API Routes
 * Endpoints for managing projects and domain mappings
 */

const express = require('express');
const db = require('../../database/db');

const router = express.Router();

/**
 * GET /api/projects
 * List all projects
 */
router.get('/projects', (req, res) => {
  try {
    const projects = db.getProjects();
    res.json(projects);
  } catch (error) {
    console.error('Error in GET /api/projects:', error);
    res.status(500).json({ error: 'Failed to get projects' });
  }
});

/**
 * POST /api/projects
 * Create a new project
 */
router.post('/projects', (req, res) => {
  try {
    const { name, description, color } = req.body;

    if (!name || name.trim() === '') {
      return res.status(400).json({ error: 'Project name is required' });
    }

    const projectId = db.createProject({
      name: name.trim(),
      description: description || null,
      color: color || '#3B82F6'
    });

    const project = db.getProject(projectId);
    res.status(201).json(project);
  } catch (error) {
    console.error('Error in POST /api/projects:', error);
    if (error.message.includes('UNIQUE')) {
      res.status(400).json({ error: 'Project name already exists' });
    } else {
      res.status(500).json({ error: 'Failed to create project' });
    }
  }
});

/**
 * GET /api/projects/:id
 * Get a single project
 */
router.get('/projects/:id', (req, res) => {
  try {
    const { id } = req.params;
    const project = db.getProject(parseInt(id, 10));

    if (!project) {
      return res.status(404).json({ error: 'Project not found' });
    }

    res.json(project);
  } catch (error) {
    console.error('Error in GET /api/projects/:id:', error);
    res.status(500).json({ error: 'Failed to get project' });
  }
});

/**
 * PUT /api/projects/:id
 * Update a project
 */
router.put('/projects/:id', (req, res) => {
  try {
    const { id } = req.params;
    const { name, description, color } = req.body;

    const project = db.getProject(parseInt(id, 10));
    if (!project) {
      return res.status(404).json({ error: 'Project not found' });
    }

    db.updateProject(parseInt(id, 10), {
      name: name !== undefined ? name.trim() : undefined,
      description,
      color
    });

    const updated = db.getProject(parseInt(id, 10));
    res.json(updated);
  } catch (error) {
    console.error('Error in PUT /api/projects/:id:', error);
    if (error.message.includes('UNIQUE')) {
      res.status(400).json({ error: 'Project name already exists' });
    } else {
      res.status(500).json({ error: 'Failed to update project' });
    }
  }
});

/**
 * DELETE /api/projects/:id
 * Archive a project
 */
router.delete('/projects/:id', (req, res) => {
  try {
    const { id } = req.params;

    const project = db.getProject(parseInt(id, 10));
    if (!project) {
      return res.status(404).json({ error: 'Project not found' });
    }

    db.archiveProject(parseInt(id, 10));
    res.json({ success: true, message: 'Project archived' });
  } catch (error) {
    console.error('Error in DELETE /api/projects/:id:', error);
    res.status(500).json({ error: 'Failed to archive project' });
  }
});

/**
 * GET /api/projects/:id/domains
 * Get domain mappings for a project
 */
router.get('/projects/:id/domains', (req, res) => {
  try {
    const { id } = req.params;
    const domains = db.getProjectDomains(parseInt(id, 10));
    res.json(domains);
  } catch (error) {
    console.error('Error in GET /api/projects/:id/domains:', error);
    res.status(500).json({ error: 'Failed to get domains' });
  }
});

/**
 * POST /api/projects/:id/domains
 * Add a domain mapping to a project
 */
router.post('/projects/:id/domains', (req, res) => {
  try {
    const { id } = req.params;
    const { domain } = req.body;

    if (!domain || domain.trim() === '') {
      return res.status(400).json({ error: 'Domain is required' });
    }

    db.addProjectDomain(parseInt(id, 10), domain.trim().toLowerCase());
    const domains = db.getProjectDomains(parseInt(id, 10));
    res.status(201).json(domains);
  } catch (error) {
    console.error('Error in POST /api/projects/:id/domains:', error);
    if (error.message.includes('already mapped')) {
      res.status(400).json({ error: 'Domain already mapped to this project' });
    } else {
      res.status(500).json({ error: 'Failed to add domain' });
    }
  }
});

/**
 * DELETE /api/project-domains/:id
 * Remove a domain mapping
 */
router.delete('/project-domains/:id', (req, res) => {
  try {
    const { id } = req.params;
    db.removeProjectDomain(parseInt(id, 10));
    res.json({ success: true, message: 'Domain mapping removed' });
  } catch (error) {
    console.error('Error in DELETE /api/project-domains/:id:', error);
    res.status(500).json({ error: 'Failed to remove domain' });
  }
});

/**
 * POST /api/sessions/:id/assign-project
 * Manually assign a session to a project
 */
router.post('/sessions/:id/assign-project', (req, res) => {
  try {
    const { id } = req.params;
    const { project_id } = req.body;

    db.assignSessionToProject(parseInt(id, 10), project_id ? parseInt(project_id, 10) : null);
    res.json({ success: true, message: 'Session assigned to project' });
  } catch (error) {
    console.error('Error in POST /api/sessions/:id/assign-project:', error);
    res.status(500).json({ error: 'Failed to assign session' });
  }
});

module.exports = router;

import express from 'express';
import cors from 'cors';
import bodyParser from 'body-parser';
import bcrypt from 'bcryptjs';
import { promises as fs } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 5000;
const USERS_FILE = './users.json';
const PROJECTS_FILE = './projects.json';

// Middleware
app.use(cors());
app.use(bodyParser.json());
app.use(express.static(path.join(__dirname, '.')));

// Validation helper
function validateEmail(email) {
  const re = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return re.test(email);
}

function validatePassword(password) {
  return password.length >= 6;
}

// Kullanıcıları dosyadan oku
async function readUsers() {
  try {
    const data = await fs.readFile(USERS_FILE, 'utf-8');
    return JSON.parse(data);
  } catch (e) {
    return [];
  }
}

// Kullanıcıları dosyaya yaz
async function writeUsers(users) {
  await fs.writeFile(USERS_FILE, JSON.stringify(users, null, 2));
}

// Projeleri dosyadan oku
async function readProjects() {
  try {
    const data = await fs.readFile(PROJECTS_FILE, 'utf-8');
    return JSON.parse(data);
  } catch (e) {
    return [];
  }
}

// Projeleri dosyaya yaz
async function writeProjects(projects) {
  await fs.writeFile(PROJECTS_FILE, JSON.stringify(projects, null, 2));
}

// API Routes

// Signup endpoint
app.post('/api/signup', async (req, res) => {
  try {
    const { firstname, lastname, username, email, password, userType } = req.body;
    
    // Validation
    if (!firstname || !lastname || !username || !email || !password || !userType) {
      return res.status(400).json({ 
        success: false, 
        message: 'All fields are required.' 
      });
    }

    if (!validateEmail(email)) {
      return res.status(400).json({ 
        success: false, 
        message: 'Please enter a valid email address.' 
      });
    }

    if (!validatePassword(password)) {
      return res.status(400).json({ 
        success: false, 
        message: 'Password must be at least 6 characters long.' 
      });
    }

    if (userType !== 'entrepreneur' && userType !== 'investor') {
      return res.status(400).json({ 
        success: false, 
        message: 'User type must be either entrepreneur or investor.' 
      });
    }

    const users = await readUsers();
    
    if (users.find(u => u.username === username)) {
      return res.status(409).json({ 
        success: false, 
        message: 'Username already exists.' 
      });
    }
    
    if (users.find(u => u.email === email)) {
      return res.status(409).json({ 
        success: false, 
        message: 'Email already exists.' 
      });
    }

    const hashedPassword = await bcrypt.hash(password, 12);
    const newUser = {
      id: Date.now().toString(),
      firstname,
      lastname,
      username,
      email,
      password: hashedPassword,
      userType,
      createdAt: new Date().toISOString(),
      profile: {
        bio: '',
        skills: [],
        interests: [],
        location: '',
        website: ''
      }
    };

    users.push(newUser);
    await writeUsers(users);
    
    return res.json({ 
      success: true, 
      message: 'User created successfully!',
      user: {
        id: newUser.id,
        username: newUser.username,
        firstname: newUser.firstname,
        userType: newUser.userType
      }
    });
  } catch (error) {
    console.error('Signup error:', error);
    return res.status(500).json({ 
      success: false, 
      message: 'Internal server error.' 
    });
  }
});

// Login endpoint
app.post('/api/login', async (req, res) => {
  try {
    const { usernameOrEmail, password } = req.body;
    
    if (!usernameOrEmail || !password) {
      return res.status(400).json({ 
        success: false, 
        message: 'All fields are required.' 
      });
    }

    const users = await readUsers();
    const user = users.find(u => 
      u.username === usernameOrEmail || u.email === usernameOrEmail
    );
    
    if (!user) {
      return res.status(401).json({ 
        success: false, 
        message: 'User not found.' 
      });
    }

    const match = await bcrypt.compare(password, user.password);
    if (!match) {
      return res.status(401).json({ 
        success: false, 
        message: 'Incorrect password.' 
      });
    }

    return res.json({ 
      success: true, 
      message: 'Login successful!',
      user: {
        id: user.id,
        username: user.username,
        firstname: user.firstname,
        userType: user.userType,
        profile: user.profile
      }
    });
  } catch (error) {
    console.error('Login error:', error);
    return res.status(500).json({ 
      success: false, 
      message: 'Internal server error.' 
    });
  }
});

// Get user profile
app.get('/api/user/:username', async (req, res) => {
  try {
    const { username } = req.params;
    const users = await readUsers();
    const user = users.find(u => u.username === username);
    
    if (!user) {
      return res.status(404).json({ 
        success: false, 
        message: 'User not found.' 
      });
    }

    const { password, ...userWithoutPassword } = user;
    return res.json({ 
      success: true, 
      user: userWithoutPassword 
    });
  } catch (error) {
    console.error('Get user error:', error);
    return res.status(500).json({ 
      success: false, 
      message: 'Internal server error.' 
    });
  }
});

// Update user profile
app.put('/api/user/:username', async (req, res) => {
  try {
    const { username } = req.params;
    const { profile } = req.body;
    
    const users = await readUsers();
    const userIndex = users.findIndex(u => u.username === username);
    
    if (userIndex === -1) {
      return res.status(404).json({ 
        success: false, 
        message: 'User not found.' 
      });
    }

    users[userIndex].profile = { ...users[userIndex].profile, ...profile };
    await writeUsers(users);
    
    return res.json({ 
      success: true, 
      message: 'Profile updated successfully!' 
    });
  } catch (error) {
    console.error('Update profile error:', error);
    return res.status(500).json({ 
      success: false, 
      message: 'Internal server error.' 
    });
  }
});

// Create project (for entrepreneurs)
app.post('/api/projects', async (req, res) => {
  try {
    const { title, description, category, funding, username } = req.body;
    
    if (!title || !description || !category || !username) {
      return res.status(400).json({ 
        success: false, 
        message: 'All fields are required.' 
      });
    }

    const projects = await readProjects();
    const newProject = {
      id: Date.now().toString(),
      title,
      description,
      category,
      funding: funding || 0,
      creator: username,
      status: 'active',
      createdAt: new Date().toISOString(),
      investors: [],
      likes: 0
    };

    projects.push(newProject);
    await writeProjects(projects);
    
    return res.json({ 
      success: true, 
      message: 'Project created successfully!',
      project: newProject
    });
  } catch (error) {
    console.error('Create project error:', error);
    return res.status(500).json({ 
      success: false, 
      message: 'Internal server error.' 
    });
  }
});

// Get all projects
app.get('/api/projects', async (req, res) => {
  try {
    const { category, status, creator } = req.query;
    let projects = await readProjects();
    
    if (category) {
      projects = projects.filter(p => p.category === category);
    }
    
    if (status) {
      projects = projects.filter(p => p.status === status);
    }
    
    if (creator) {
      projects = projects.filter(p => p.creator === creator);
    }
    
    return res.json({ 
      success: true, 
      projects: projects.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
    });
  } catch (error) {
    console.error('Get projects error:', error);
    return res.status(500).json({ 
      success: false, 
      message: 'Internal server error.' 
    });
  }
});

// Get all users (admin only)
app.get('/api/users', async (req, res) => {
  try {
    const users = await readUsers();
    
    // Remove passwords from response
    const usersWithoutPasswords = users.map(user => {
      const { password, ...userWithoutPassword } = user;
      return userWithoutPassword;
    });
    
    return res.json({ 
      success: true, 
      users: usersWithoutPasswords.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
    });
  } catch (error) {
    console.error('Get users error:', error);
    return res.status(500).json({ 
      success: false, 
      message: 'Internal server error.' 
    });
  }
});

// Get project by ID
app.get('/api/projects/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const projects = await readProjects();
    const project = projects.find(p => p.id === id);
    
    if (!project) {
      return res.status(404).json({ 
        success: false, 
        message: 'Project not found.' 
      });
    }
    
    return res.json({ 
      success: true, 
      project 
    });
  } catch (error) {
    console.error('Get project error:', error);
    return res.status(500).json({ 
      success: false, 
      message: 'Internal server error.' 
    });
  }
});

// Like project
app.post('/api/projects/:id/like', async (req, res) => {
  try {
    const { id } = req.params;
    const projects = await readProjects();
    const projectIndex = projects.findIndex(p => p.id === id);
    
    if (projectIndex === -1) {
      return res.status(404).json({ 
        success: false, 
        message: 'Project not found.' 
      });
    }
    
    projects[projectIndex].likes += 1;
    await writeProjects(projects);
    
    return res.json({ 
      success: true, 
      message: 'Project liked!',
      likes: projects[projectIndex].likes
    });
  } catch (error) {
    console.error('Like project error:', error);
    return res.status(500).json({ 
      success: false, 
      message: 'Internal server error.' 
    });
  }
});

// Express route for serving HTML files
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'index.html.html'));
});

app.get('/login', (req, res) => {
  res.sendFile(path.join(__dirname, 'login.html'));
});

app.get('/signup', (req, res) => {
  res.sendFile(path.join(__dirname, 'signup.html'));
});

app.get('/entrepreneur', (req, res) => {
  res.sendFile(path.join(__dirname, 'entrepreneur_updated.html'));
});

app.get('/investor', (req, res) => {
  res.sendFile(path.join(__dirname, 'investor.html'));
});

// Error handling middleware
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).json({ 
    success: false, 
    message: 'Something went wrong!' 
  });
});

// 404 handler
app.use((req, res) => {
  res.status(404).json({ 
    success: false, 
    message: 'Route not found.' 
  });
});

app.listen(PORT, () => {
  console.log(`🚀 IDEAI Server running on http://localhost:${PORT}`);
  console.log(`📁 Static files served from: ${__dirname}`);
}); 
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
    const { title, description, category, funding, username, lookingForInvestment } = req.body;
    
    if (!title || !description || !username) {
      return res.status(400).json({ 
        success: false, 
        message: 'Title, description and username are required.' 
      });
    }

    const projects = await readProjects();
    const newProject = {
      id: Date.now().toString(),
      title,
      description,
      category: category || 'tech',
      funding: funding || 0,
      creator: username,
      lookingForInvestment: lookingForInvestment || false,
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

// Delete project
app.delete('/api/projects/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { username } = req.query;
    
    console.log('Delete project request:', { id, username, query: req.query });
    
    if (!username) {
      return res.status(400).json({ 
        success: false, 
        message: 'Username is required.' 
      });
    }
    
    const projects = await readProjects();
    const projectIndex = projects.findIndex(p => p.id === id);
    
    if (projectIndex === -1) {
      return res.status(404).json({ 
        success: false, 
        message: 'Project not found.' 
      });
    }
    
    const project = projects[projectIndex];
    
    // Check if user owns the project
    if (project.creator !== username) {
      return res.status(403).json({ 
        success: false, 
        message: 'You can only delete your own projects.' 
      });
    }
    
    // Remove project
    projects.splice(projectIndex, 1);
    await writeProjects(projects);
    
    return res.json({ 
      success: true, 
      message: 'Project deleted successfully!' 
    });
  } catch (error) {
    console.error('Delete project error:', error);
    return res.status(500).json({ 
      success: false, 
      message: 'Internal server error.' 
    });
  }
});

// Add project to favorites
app.post('/api/favorites', async (req, res) => {
  try {
    const { username, projectId } = req.body;
    
    if (!username || !projectId) {
      return res.status(400).json({ 
        success: false, 
        message: 'Username and project ID are required.' 
      });
    }
    
    const users = await readUsers();
    const userIndex = users.findIndex(u => u.username === username);
    
    if (userIndex === -1) {
      return res.status(404).json({ 
        success: false, 
        message: 'User not found.' 
      });
    }
    
    // Check if project exists (real projects or demo projects)
    const projects = await readProjects();
    let project = projects.find(p => p.id === projectId);
    
    // If not found in real projects, check if it's a demo project
    if (!project) {
      const demoProjects = [
        { id: "demo-1", title: "AI-Powered Health Platform", category: "health" },
        { id: "demo-2", title: "Online Education Portal", category: "education" },
        { id: "demo-3", title: "Finansal Danışmanlık Uygulaması", category: "finance" },
        { id: "demo-4", title: "Smart Home Automation System", category: "tech" },
        { id: "demo-5", title: "Dijital Kitaplık", category: "other" },
        { id: "demo-6", title: "Sağlıklı Yaşam Takipçisi", category: "health" },
        { id: "demo-7", title: "Çevrimiçi Mentorluk Platformu", category: "tech" },
        { id: "demo-8", title: "Çocuklar için Kodlama Atölyesi", category: "education" }
      ];
      project = demoProjects.find(p => p.id === projectId);
    }
    
    if (!project) {
      return res.status(404).json({ 
        success: false, 
        message: 'Project not found.' 
      });
    }
    
    // Initialize favorites array if it doesn't exist
    if (!users[userIndex].favorites) {
      users[userIndex].favorites = [];
    }
    
    // Check if already in favorites
    if (users[userIndex].favorites.includes(projectId)) {
      return res.status(409).json({ 
        success: false, 
        message: 'Project already in favorites.' 
      });
    }
    
    // Add to favorites
    users[userIndex].favorites.push(projectId);
    await writeUsers(users);
    
    return res.json({ 
      success: true, 
      message: 'Project added to favorites!' 
    });
  } catch (error) {
    console.error('Add to favorites error:', error);
    return res.status(500).json({ 
      success: false, 
      message: 'Internal server error.' 
    });
  }
});

// Remove project from favorites
app.delete('/api/favorites/:projectId', async (req, res) => {
  try {
    const { projectId } = req.params;
    const { username } = req.query;
    
    if (!username) {
      return res.status(400).json({ 
        success: false, 
        message: 'Username is required.' 
      });
    }
    
    const users = await readUsers();
    const userIndex = users.findIndex(u => u.username === username);
    
    if (userIndex === -1) {
      return res.status(404).json({ 
        success: false, 
        message: 'User not found.' 
      });
    }
    
    if (!users[userIndex].favorites) {
      return res.status(404).json({ 
        success: false, 
        message: 'No favorites found.' 
      });
    }
    
    const favoriteIndex = users[userIndex].favorites.indexOf(projectId);
    if (favoriteIndex === -1) {
      return res.status(404).json({ 
        success: false, 
        message: 'Project not in favorites.' 
      });
    }
    
    // Remove from favorites
    users[userIndex].favorites.splice(favoriteIndex, 1);
    await writeUsers(users);
    
    return res.json({ 
      success: true, 
      message: 'Project removed from favorites!' 
    });
  } catch (error) {
    console.error('Remove from favorites error:', error);
    return res.status(500).json({ 
      success: false, 
      message: 'Internal server error.' 
    });
  }
});

// Get user favorites
app.get('/api/favorites/:username', async (req, res) => {
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
    
    if (!user.favorites || user.favorites.length === 0) {
      return res.json({ 
        success: true, 
        favorites: [] 
      });
    }
    
    // Get favorite projects (real + demo)
    const projects = await readProjects();
    const demoProjects = [
      { id: "demo-1", title: "AI-Powered Health Platform", description: "A platform that analyzes patient health data and provides recommendations to doctors.", category: "health", creator: "sarahjohnson", likes: 42, status: "active", funding: 80, badge: "Bestseller", logo: "🧬", tags: ["AI", "Health", "New"], comments: 12, investors: 3, isDemo: true },
      { id: "demo-2", title: "Online Education Portal", description: "A platform offering interactive and personalized educational content for all ages.", category: "education", creator: "michaelchen", likes: 35, status: "active", funding: 60, logo: "📚", tags: ["Education", "Popular"], comments: 8, investors: 2, isDemo: true },
      { id: "demo-3", title: "Finansal Danışmanlık Uygulaması", description: "KOBİ'ler için finansal analiz ve yatırım önerileri sunan mobil uygulama.", category: "finance", creator: "mehmetkaya", likes: 28, status: "completed", funding: 100, badge: "Bestseller", logo: "💸", tags: ["Finance", "AI"], comments: 15, investors: 4, isDemo: true },
      { id: "demo-4", title: "Smart Home Automation System", description: "IoT-based system for remote control of home devices.", category: "tech", creator: "davidkim", likes: 22, status: "active", funding: 40, logo: "🏠", tags: ["IoT", "Technology"], comments: 5, investors: 1, isDemo: true },
      { id: "demo-5", title: "Dijital Kitaplık", description: "Kullanıcıların kitaplarını dijital ortamda saklayıp paylaşabildiği bir platform.", category: "other", creator: "aysedemir", likes: 18, status: "active", funding: 30, logo: "📖", tags: ["Books", "New"], comments: 3, investors: 1, isDemo: true },
      { id: "demo-6", title: "Sağlıklı Yaşam Takipçisi", description: "Kişisel sağlık hedeflerini takip eden ve öneriler sunan mobil uygulama.", category: "health", creator: "elifcelik", likes: 25, status: "completed", funding: 90, logo: "🏃‍♂️", tags: ["Health", "Mobile"], comments: 7, investors: 2, isDemo: true },
      { id: "demo-7", title: "Çevrimiçi Mentorluk Platformu", description: "Girişimciler ve yatırımcıları buluşturan, mentorluk desteği sunan platform.", category: "tech", creator: "buraksahin", likes: 30, status: "active", funding: 70, logo: "🤝", tags: ["Mentorship", "Technology", "Popular"], comments: 10, investors: 3, isDemo: true },
      { id: "demo-8", title: "Çocuklar için Kodlama Atölyesi", description: "Çocuklara kodlama öğretmek için oyunlaştırılmış eğitim platformu.", category: "education", creator: "fatmagunes", likes: 20, status: "active", funding: 50, logo: "👾", tags: ["Education", "Kids"], comments: 4, investors: 1, isDemo: true }
    ];
    
    const allProjects = [...projects, ...demoProjects];
    const favoriteProjects = allProjects.filter(p => user.favorites.includes(p.id));
    
    return res.json({ 
      success: true, 
      favorites: favoriteProjects 
    });
  } catch (error) {
    console.error('Get favorites error:', error);
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

app.get('/investor-favorites', (req, res) => {
  res.sendFile(path.join(__dirname, 'investor-favorites.html'));
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
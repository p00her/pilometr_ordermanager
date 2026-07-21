import { useState } from 'react';
import { Outlet, useNavigate, useLocation } from 'react-router-dom';
import {
  AppBar,
  Box,
  CssBaseline,
  Drawer,
  IconButton,
  List,
  ListItemButton,
  ListItemIcon,
  ListItemText,
  Toolbar,
  Typography,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  Divider,
  useMediaQuery,
  useTheme,
} from '@mui/material';
import MenuIcon from '@mui/icons-material/Menu';
import ChevronLeftIcon from '@mui/icons-material/ChevronLeft';
import ChevronRightIcon from '@mui/icons-material/ChevronRight';
import DashboardIcon from '@mui/icons-material/Dashboard';
import ShoppingCartIcon from '@mui/icons-material/ShoppingCart';
import SendToMobileIcon from '@mui/icons-material/SendToMobile';
import LightModeIcon from '@mui/icons-material/LightMode';
import DarkModeIcon from '@mui/icons-material/DarkMode';
import SettingsBrightnessIcon from '@mui/icons-material/SettingsBrightness';
import LogoutIcon from '@mui/icons-material/Logout';
import { useThemeMode } from '../context/ThemeContext';

const navItems = [
  { label: 'Статистика', path: '/', icon: <DashboardIcon /> },
  { label: 'Заказы', path: '/orders', icon: <ShoppingCartIcon /> },
];

const nextMode: Record<string, 'dark' | 'system' | 'light'> = {
  light: 'dark',
  dark: 'system',
  system: 'light',
};

const modeIcon: Record<string, typeof LightModeIcon> = {
  light: LightModeIcon,
  dark: DarkModeIcon,
  system: SettingsBrightnessIcon,
};

export default function Layout({ userName, onLogout }: { userName: string; onLogout: () => void }) {
  const [mobileOpen, setMobileOpen] = useState(false);
  const [maxDialogOpen, setMaxDialogOpen] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const navigate = useNavigate();
  const location = useLocation();
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down('md'));
  const { mode, setMode } = useThemeMode();
  const drawerWidth = sidebarCollapsed ? 64 : 260;

  const Icon = modeIcon[mode];

  const drawer = (
    <Box sx={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      <Toolbar />
      <List>
        {navItems.map((item) => (
          <ListItemButton
            key={item.path}
            selected={location.pathname === item.path}
            sx={{ justifyContent: sidebarCollapsed ? 'center' : undefined, px: sidebarCollapsed ? 1 : 2 }}
            onClick={() => {
              navigate(item.path);
              if (isMobile) setMobileOpen(false);
            }}
          >
            <ListItemIcon sx={{ minWidth: sidebarCollapsed ? 0 : 56 }}>
              {item.icon}
            </ListItemIcon>
            {!sidebarCollapsed && <ListItemText primary={item.label} />}
          </ListItemButton>
        ))}
      </List>
      <Box sx={{ flexGrow: 1 }} />
      <Divider />
      <List>
        <ListItemButton
          onClick={() => setMaxDialogOpen(true)}
          sx={{ justifyContent: sidebarCollapsed ? 'center' : undefined, px: sidebarCollapsed ? 1 : 2 }}
        >
          <ListItemIcon sx={{ minWidth: sidebarCollapsed ? 0 : 56 }}>
            <SendToMobileIcon />
          </ListItemIcon>
          {!sidebarCollapsed && <ListItemText primary="MAX" secondary="Уведомления" />}
        </ListItemButton>
      </List>
      <Divider />
      <Box sx={{ display: 'flex', justifyContent: 'center', py: 1 }}>
        <IconButton onClick={() => setSidebarCollapsed((c) => !c)} sx={{ color: 'text.secondary' }}>
          {sidebarCollapsed ? <ChevronRightIcon /> : <ChevronLeftIcon />}
        </IconButton>
      </Box>
    </Box>
  );

  return (
    <Box sx={{ display: 'flex' }}>
      <CssBaseline />
      <AppBar
        position="fixed"
        sx={{ zIndex: (t) => t.zIndex.drawer + 1 }}
        style={{
          backgroundColor: theme.palette.mode === 'light' ? '#7c965a' : '#2c371e',
          backgroundImage: 'none',
        }}
      >
        <Toolbar>
          <IconButton
            color="inherit"
            edge="start"
            onClick={() => setMobileOpen(!mobileOpen)}
            sx={{ mr: 2, display: { md: 'none' } }}
          >
            <MenuIcon />
          </IconButton>
          <Box
            component="img"
            src="https://pilometr.ru/templates/pilometr/newfront/img/new_new/logo_white.svg"
            alt="Pilometr"
            sx={{ height: 36, mr: 1.5 }}
          />
          <Typography variant="h6" noWrap sx={{ flexGrow: 1 }}>
            Управление заказами
          </Typography>

          <Typography variant="body2" sx={{ mr: 1, display: { xs: 'none', sm: 'block' } }}>
            {userName}
          </Typography>

          <IconButton
            color="inherit"
            onClick={() => setMode(nextMode[mode])}
            title={`Тема: ${mode}`}
            sx={{ borderRadius: 1, gap: 0.5 }}
          >
            <Icon />
            <Typography
              variant="body2"
              sx={{ display: { xs: 'none', sm: 'inline' }, textTransform: 'none' }}
            >
              {mode === 'light' ? 'Светлая' : mode === 'dark' ? 'Тёмная' : 'Авто'}
            </Typography>
          </IconButton>

          <IconButton color="inherit" onClick={onLogout} title="Выйти">
            <LogoutIcon />
          </IconButton>
        </Toolbar>
      </AppBar>

      <Box
        component="nav"
        sx={{
          width: { md: drawerWidth },
          flexShrink: { md: 0 },
          transition: 'width 0.2s ease',
        }}
      >
        {isMobile ? (
          <Drawer
            variant="temporary"
            open={mobileOpen}
            onClose={() => setMobileOpen(false)}
            ModalProps={{ keepMounted: true }}
            slotProps={{ paper: { sx: { width: 260 } } }}
          >
            {drawer}
          </Drawer>
        ) : (
          <Drawer
            variant="permanent"
            open
            slotProps={{
              paper: {
                sx: {
                  width: sidebarCollapsed ? 64 : 260,
                  transition: 'width 0.2s ease',
                },
              },
            }}
          >
            {drawer}
          </Drawer>
        )}
      </Box>

      <Box
        component="main"
        sx={{
          flexGrow: 1,
          p: { xs: 1.5, sm: 2, md: 3 },
          mt: 8,
          minHeight: 'calc(100vh - 64px)',
          bgcolor: 'background.default',
          maxWidth: '100vw',
          overflowX: 'hidden',
        }}
      >
        <Outlet />
      </Box>

      <Dialog open={maxDialogOpen} onClose={() => setMaxDialogOpen(false)} maxWidth="sm" fullWidth>
        <DialogTitle>MAX уведомления</DialogTitle>
        <DialogContent>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
            Получайте уведомления о заказах в приложении MAX.
          </Typography>
          <Typography variant="subtitle2" gutterBottom>Как подключить:</Typography>
          <Box component="ol" sx={{ pl: 2, '& li': { mb: 1 } }}>
            <li>Установите приложение MAX на телефон</li>
             <li>
               Найдите бота <strong>@id071305521406_1_bot</strong>
               <Box sx={{ textAlign: 'center', my: 1.5 }}>
                 <img
                   src="https://api.qrserver.com/v1/create-qr-code/?size=160x160&data=https://max.ru/id071305521406_1_bot"
                   alt="QR: @id071305521406_1_bot"
                   style={{ borderRadius: 8, display: 'block', margin: '0 auto' }}
                 />
               </Box>
             </li>
            <li>Откройте мини-приложение бота</li>
            <li>Введите ваш email (логин) и нажмите «Подключить»</li>
          </Box>
          <Button
            variant="outlined"
            size="small"
            href="/max-app"
            target="_blank"
            sx={{ mt: 1 }}
          >
            Открыть страницу подключения
          </Button>
          <Typography variant="subtitle2" gutterBottom sx={{ mt: 3 }}>
            Настройки уведомлений
          </Typography>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
            Выберите, о каких событиях получать уведомления.
          </Typography>
          <Button
            variant="outlined"
            size="small"
            onClick={() => { setMaxDialogOpen(false); navigate('/max-settings'); }}
          >
            Настроить уведомления
          </Button>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setMaxDialogOpen(false)}>Закрыть</Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}

--[[
  Twitch Kit — lancement du serveur depuis OBS
  =============================================

  À ajouter une fois dans OBS : Outils -> Scripts -> onglet Scripts -> bouton +
  puis choisir ce fichier.

  Le serveur démarre avec OBS, sans aucune fenêtre visible, et s'arrête
  quand OBS se ferme. Ses messages vont dans data/server.log.
  Rien n'est installé au démarrage de Windows.
]]

local obs = obslua

-- script_path() renvoie le dossier de ce fichier, séparateur final compris.
-- Le .lua vit à la racine du projet : aucun chemin n'est codé en dur.
local ROOT     = script_path()
local LAUNCHER = ROOT .. "start_server_hidden.vbs"
local LOG_FILE = ROOT .. "data/server.log"
local PID_FILE = ROOT .. "data/server.pid"
local HOME_URL = "http://127.0.0.1:8787/"

local autostart = true

local function log(msg)
  obs.script_log(obs.LOG_INFO, msg)
end

-- chemins en antislash pour cmd et wscript
local function win_path(p)
  return (p:gsub("/", "\\"))
end

--[[ ==================== lancement sans attente ==================== ]]

-- os.execute passe par cmd.exe et ATTEND la fin de la commande : appelé depuis
-- script_load/script_unload, il gelait l'interface d'OBS une à trois secondes.
-- OBS embarque LuaJIT : ShellExecuteW lance le processus et rend la main aussitôt,
-- sans cmd.exe ni console qui clignote.
local ok_ffi, ffi = pcall(require, "ffi")
local shell32, kernel32

if ok_ffi then
  -- déjà déclarées si le script est rechargé dans le même état Lua : erreur ignorée
  pcall(ffi.cdef, [[
    void* ShellExecuteW(void* hwnd, const uint16_t* op, const uint16_t* file,
                        const uint16_t* params, const uint16_t* dir, int show);
    int MultiByteToWideChar(unsigned int cp, unsigned long flags, const char* str,
                            int cb, uint16_t* wstr, int cch);
  ]])
  local ok_load, lib = pcall(ffi.load, "shell32")
  -- l'accès résout les symboles : s'il échoue, on garde le repli os.execute
  if ok_load and pcall(function() return lib.ShellExecuteW and ffi.C.MultiByteToWideChar end) then
    shell32  = lib
    kernel32 = ffi.C
  end
end

-- script_path() est en UTF-8 : un dossier avec accents doit rester lisible
local function wide(s)
  if s == nil then return nil end
  local n = kernel32.MultiByteToWideChar(65001, 0, s, -1, nil, 0)
  local buf = ffi.new("uint16_t[?]", n)
  kernel32.MultiByteToWideChar(65001, 0, s, -1, buf, n)
  return buf
end

-- show : 0 = masqué, 1 = normal (navigateur, éditeur)
local function spawn(file, params, show)
  if shell32 then
    local r = shell32.ShellExecuteW(nil, wide("open"), wide(file), wide(params), nil, show)
    -- une valeur <= 32 est un code d'erreur
    if tonumber(ffi.cast("intptr_t", r)) <= 32 then
      log("Échec du lancement de " .. file)
    end
    return
  end
  -- repli sans ffi : "start" rend la main dès le lancement, cmd ne bloque presque pas
  os.execute(string.format('start "" /B "%s" %s', file, params or ""))
end

local function read_pid()
  local f = io.open(PID_FILE, "r")
  if not f then return nil end
  local content = f:read("*a")
  f:close()
  return tonumber(content and content:match("%d+"))
end

local function start_server()
  -- On passe par le .vbs plutôt que par un "start /B" : lancé ainsi, node
  -- héritait de la console créée par OBS, qui restait affichée tout le stream.
  -- Le .vbs choisit aussi le node.exe embarqué (runtime\) s'il est là.
  -- Serveur déjà lancé ? l'instance en trop s'arrête seule (port occupé).
  spawn("wscript.exe", string.format('//nologo "%s"', win_path(LAUNCHER)), 0)
  log("Serveur démarré — page d'accueil : " .. HOME_URL)
end

local function stop_server()
  local pid = read_pid()
  if not pid then
    log("Aucun server.pid : rien à arrêter.")
    return
  end

  -- Double filtre : même si le PID est périmé et a été recyclé par Windows,
  -- seul un node.exe peut être tué. taskkill tourne dans son propre processus :
  -- OBS n'attend pas qu'il ait fini.
  spawn("taskkill.exe", string.format(
    '/F /FI "PID eq %d" /FI "IMAGENAME eq node.exe"', pid), 0)
  os.remove(PID_FILE)
  log("Serveur arrêté (PID " .. pid .. ").")
end

--[[ ==================== panneau du script ==================== ]]

local function on_home(props, prop)
  spawn(HOME_URL, nil, 1)
  return true
end

local function on_start(props, prop)
  start_server()
  return true
end

local function on_stop(props, prop)
  stop_server()
  return true
end

local function on_open_log(props, prop)
  spawn(win_path(LOG_FILE), nil, 1)
  return true
end

function script_properties()
  local props = obs.obs_properties_create()

  obs.obs_properties_add_button(props, "btn_home",  "Ouvrir la page d'accueil", on_home)
  obs.obs_properties_add_bool(props, "autostart",   "Démarrer avec OBS")
  obs.obs_properties_add_button(props, "btn_start", "Démarrer maintenant", on_start)
  obs.obs_properties_add_button(props, "btn_stop",  "Arrêter", on_stop)
  obs.obs_properties_add_button(props, "btn_log",   "Ouvrir le journal (en cas de problème)", on_open_log)

  return props
end

function script_defaults(settings)
  obs.obs_data_set_default_bool(settings, "autostart", true)
end

function script_update(settings)
  autostart = obs.obs_data_get_bool(settings, "autostart")
end

function script_description()
  return [[<b>Twitch Kit</b><br/><br/>
Démarre les outils du stream à l'ouverture d'OBS et les arrête à la fermeture.
Rien d'autre à faire ici : tout se règle sur la page d'accueil.]]
end

function script_load(settings)
  autostart = obs.obs_data_get_bool(settings, "autostart")
  if autostart then
    start_server()
  end
end

function script_unload()
  -- appelé quand OBS se ferme, et à chaque rechargement du script
  stop_server()
end

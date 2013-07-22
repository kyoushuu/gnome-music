import dbus
import dbus.service
from dbus.mainloop.glib import DBusGMainLoop

from gnomemusic.player import PlaybackStatus, RepeatType


class MediaPlayer2Service(dbus.service.Object):
    MEDIA_PLAYER2_IFACE = 'org.mpris.MediaPlayer2'
    MEDIA_PLAYER2_PLAYER_IFACE = 'org.mpris.MediaPlayer2.Player'

    def __init__(self, app):
        DBusGMainLoop(set_as_default=True)
        name = dbus.service.BusName('org.mpris.MediaPlayer2.GnomeMusic', dbus.SessionBus())
        dbus.service.Object.__init__(self, name, '/org/mpris/MediaPlayer2')
        self.app = app
        self.player = app.get_active_window().player
        self.player.connect("current-changed", self._on_current_changed)
        self.player.connect("playback-status-changed", self._on_playback_status_changed)
        self.player.connect("repeat-mode-changed", self._on_repeat_mode_changed)

    def _get_playback_status(self):
        state = self.player.get_playback_status()
        if state == PlaybackStatus.PLAYING:
            return 'Playing'
        elif state == PlaybackStatus.PAUSED:
            return 'Paused'
        else:
            return 'Stopped'

    def _get_loop_status(self):
        if self.player.repeat == RepeatType.NONE:
            return 'None'
        elif self.player.repeat == RepeatType.SONG:
            return 'Track'
        else:
            return 'Playlist'

    def _on_current_changed(self, player, data=None):
        self.PropertiesChanged(self.MEDIA_PLAYER2_PLAYER_IFACE,
            {
                'Metadata': dbus.Dictionary(self.player.get_metadata(), signature='sv'),
                'CanPlay': True,
                'CanPause': True,
            },
            [])

    def _on_playback_status_changed(self, data=None):
        self.PropertiesChanged(self.MEDIA_PLAYER2_PLAYER_IFACE,
            {
                'PlaybackStatus': self._get_playback_status(),
            },
            [])

    def _on_repeat_mode_changed(self, player, data=None):
        self.PropertiesChanged(self.MEDIA_PLAYER2_PLAYER_IFACE,
            {
                'LoopStatus': self._get_loop_status(),
                'Shuffle': self.player.repeat == RepeatType.SHUFFLE,
            },
            [])

    @dbus.service.method(dbus_interface=MEDIA_PLAYER2_IFACE)
    def Raise(self):
        self.app.do_activate()

    @dbus.service.method(dbus_interface=MEDIA_PLAYER2_IFACE)
    def Quit(self):
        self.app.quit()

    @dbus.service.method(dbus_interface=MEDIA_PLAYER2_PLAYER_IFACE)
    def Next(self):
        self.player.play_next()

    @dbus.service.method(dbus_interface=MEDIA_PLAYER2_PLAYER_IFACE)
    def Previous(self):
        self.player.play_previous()

    @dbus.service.method(dbus_interface=MEDIA_PLAYER2_PLAYER_IFACE)
    def Pause(self):
        self.player.set_playing(False)

    @dbus.service.method(dbus_interface=MEDIA_PLAYER2_PLAYER_IFACE)
    def PlayPause(self):
        self.player.play_pause()

    @dbus.service.method(dbus_interface=MEDIA_PLAYER2_PLAYER_IFACE)
    def Stop(self):
        self.player.Stop()

    @dbus.service.method(dbus_interface=MEDIA_PLAYER2_PLAYER_IFACE)
    def Play(self):
        self.player.set_playing(True)

    @dbus.service.method(dbus_interface=MEDIA_PLAYER2_PLAYER_IFACE,
                         in_signature='s')
    def OpenUri(self, uri):
        pass

    @dbus.service.method(dbus_interface=dbus.PROPERTIES_IFACE,
                         in_signature='ss', out_signature='v')
    def Get(self, interface_name, property_name):
        return self.GetAll(interface_name)[property_name]

    @dbus.service.method(dbus_interface=dbus.PROPERTIES_IFACE,
                         in_signature='s', out_signature='a{sv}')
    def GetAll(self, interface_name):
        if interface_name == self.MEDIA_PLAYER2_IFACE:
            return {
                'CanQuit': True,
                'CanRaise': True,
                'HasTrackList': False,
                'Identity': 'Music',
                'DesktopEntry': 'gnome-music',
                'SupportedUriSchemes': [
                    'file'
                ],
                'SupportedMimeTypes': [
                    'application/ogg',
                    'audio/x-vorbis+ogg',
                    'audio/x-flac',
                    'audio/mpeg'
                ],
            }
        elif interface_name == self.MEDIA_PLAYER2_PLAYER_IFACE:
            return {
                'PlaybackStatus': self._get_playback_status(),
                'LoopStatus': self._get_loop_status(),
                'Rate': 1.0,
                'Shuffle': self.player.repeat == RepeatType.SHUFFLE,
                'Metadata': dbus.Dictionary(self.player.get_metadata(), signature='sv'),
                'MinimumRate': 1.0,
                'MaximumRate': 1.0,
                'CanPlay': self.player.currentTrack is not None,
                'CanPause': self.player.currentTrack is not None,
                'CanSeek': True,
                'CanControl': True,
            }
        else:
            raise dbus.exceptions.DBusException(
                'org.mpris.MediaPlayer2.GnomeMusic',
                'This object does not implement the %s interface'
                % interface_name)

    @dbus.service.method(dbus_interface=dbus.PROPERTIES_IFACE,
                         in_signature='ssv')
    def Set(self, interface_name, property_name, new_value):
        if interface_name == self.MEDIA_PLAYER2_IFACE:
            pass
        elif interface_name == self.MEDIA_PLAYER2_PLAYER_IFACE:
            if property_name == 'Rate':
                pass
            elif property_name == 'LoopStatus':
                if new_value == 'None':
                    self.player.set_repeat_mode(RepeatType.NONE)
                elif new_value == 'Track':
                    self.player.set_repeat_mode(RepeatType.SONG)
                elif new_value == 'Playlist':
                    self.player.set_repeat_mode(RepeatType.ALL)
            elif property_name == 'Shuffle':
                if (new_value and self.player.get_repeat_mode() != RepeatType.SHUFFLE):
                    self.set_repeat_mode(RepeatType.SHUFFLE)
                elif new_value and self.player.get_repeat_mode() == RepeatType.SHUFFLE:
                    self.set_repeat_mode(RepeatType.NONE)
        else:
            raise dbus.exceptions.DBusException(
                'org.mpris.MediaPlayer2.GnomeMusic',
                'This object does not implement the %s interface'
                % interface_name)

    @dbus.service.signal(dbus_interface=dbus.PROPERTIES_IFACE,
                         signature='sa{sv}as')
    def PropertiesChanged(self, interface_name, changed_properties,
                          invalidated_properties):
        pass

import apiclient.discovery
import apiclient.http
import datetime
import httplib2
import oauth2client.client
import oauth2client.file
import oauth2client.tools
import os
import sys

API_SCOPE = "https://www.googleapis.com/auth/youtube.upload"
API_SERVICE_NAME = "youtube"
API_VERSION = "v3"

class YoutubeUploader(object):
    def __init__(self, config={}):
        self.config = config

    def format_details(self, fmt):
        return fmt.format(
            home_team=self.config["home_team"]["name"] if "home_team" in self.config else "",
            away_team=self.config["away_team"]["name"] if "away_team" in self.config else "",
            game_date=self.config.get("game_date", ""),
            home_score=self.config.get("home_score", ""),
            away_score=self.config.get("away_score", ""),
            )

    def find_file(self, filename):
        fn = os.path.join(self.config["output_dir"], filename)
        while not os.path.isfile(fn):
            new_fn = os.path.abspath(os.path.join(os.path.dirname(fn), os.pardir, os.path.basename(fn)))
            if fn == new_fn:
                raise IOError("Couldn't find file {}".format(filename))
            fn = new_fn

        return fn

    def upload(self, filename):
        flow = oauth2client.client.flow_from_clientsecrets(self.find_file(self.config["youtube"]["client_secret"]), scope=API_SCOPE)
        storage = oauth2client.file.Storage(self.find_file(self.config["youtube"]["auth_storage"]))
        credentials = storage.get()

        if credentials is None or credentials.invalid:
            parser = oauth2client.tools.argparser
            args = parser.parse_args()
            credentials = oauth2client.tools.run_flow(flow, storage, args)

        api = apiclient.discovery.build(API_SERVICE_NAME, API_VERSION, http=credentials.authorize(httplib2.Http()))

        video_data = {
            "snippet": {
                "title": self.format_details(self.config["youtube"]["title"]),
                "description": self.format_details(self.config["youtube"]["description"]),
                "tags": self.config["youtube"]["tags"],
                "categoryId": self.config["youtube"]["category"],
                "notifySubscribers": False,
                },
            "status": {
                "privacyStatus": "private",
                },
            "recordingDetails": {
                "locationDescription": self.format_details(self.config["youtube"]["location"]["description"]),
                "recordingDate": self.config["game_date"].strftime("%Y-%m-%dT00:00:00.000Z"),
                "location": {
                    "latitude": self.config["youtube"]["location"]["latitude"],
                    "longitude": self.config["youtube"]["location"]["longitude"],
                    },
                },
            }

        while True:
            insert_req = api.videos().insert(
                part=",".join(video_data.keys()),
                body=video_data,
                media_body=apiclient.http.MediaFileUpload(filename, chunksize=-1, resumable=True),
                )

            status, response = insert_req.next_chunk()
            if "id" in response:
                print "Video uploaded at https://www.youtube.com/watch?v={}".format(response["id"])
                return


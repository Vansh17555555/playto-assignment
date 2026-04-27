from django.core.management import call_command


def run():
    call_command("seed")


if __name__ == "__main__":
    run()

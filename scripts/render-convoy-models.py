import os
import sys
import importlib.util

folder = os.path.dirname(os.path.abspath(__file__))
spec = importlib.util.spec_from_file_location('model_photo', os.path.join(folder, 'render-logistics-models.py'))
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)
out = os.path.join(module.ROOT, 'docs', 'wechat-fleet-20261006', 'images')

module.render('destroyer_china', '08-052d-source-model.png', 28, 'convoy-library', out)
module.render('carrier', '09-carrier-source-model.png', 32, 'convoy-library', out)
module.render('containerShip', '10-container-source-model.png', 29, 'convoy-library', out)

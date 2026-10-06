import os
import importlib.util

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(ROOT, 'docs', 'images')
spec = importlib.util.spec_from_file_location('模型摄影棚', os.path.join(ROOT, 'scripts', 'render-logistics-models.py'))
studio = importlib.util.module_from_spec(spec)
spec.loader.exec_module(studio)

# 只展示本轮游戏模型的源文件，不修改库，也不作为实机截图。
for kind, name in [('rifle', '月卫'), ('engineer', '天工'), ('scout', '巡星')]:
    studio.render('robot_' + kind, 'robot-' + kind + '-model.png', 4.6, 'robot-library', OUT)
    print(name + '机器人源模型已渲染', flush=True)
